/**
 * Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/
RED.library = (function() {

    var loadLibraryBrowser;
    var saveLibraryBrowser;
    var libraryEditor;
    var activeLibrary;

    var _libraryLookup = '<div id="red-ui-library-dialog-load" class="hide">'+
        '<form class="form-horizontal">'+
            '<div class="red-ui-library-dialog-box" style="height: 400px; position:relative; ">'+
                '<div id="red-ui-library-dialog-load-panes">'+
                    '<div class="red-ui-panel" id="red-ui-library-dialog-load-browser"></div>'+
                    '<div class="red-ui-panel">'+
                        '<div id="red-ui-library-dialog-load-preview">'+
                            '<div class="red-ui-panel" id="red-ui-library-dialog-load-preview-text"></div>'+
                            '<div class="red-ui-panel" id="red-ui-library-dialog-load-preview-details">'+
                                '<table id="red-ui-library-dialog-load-preview-details-table" class="red-ui-info-table"></table>'+
                            '</div>'+
                        '</div>'+
                    '</div>'+
                '</div>'+
            '</div>'+
        '</form>'+
    '</div>'


    var _librarySave = '<div id="red-ui-library-dialog-save" class="hide">'+
        '<form class="form-horizontal">'+
        '<div class="red-ui-library-dialog-box" style="height: 400px; position:relative; ">'+
            '<div id="red-ui-library-dialog-save-browser"></div>'+
            '<div class="form-row">'+
                '<label data-i18n="clipboard.export.exportAs"></label><input id="red-ui-library-dialog-save-filename" type="text">'+
            '</div>'+
        '</div>'+
        '</form>'+
    '</div>'

    function saveToLibrary() {
        var elementPrefix = activeLibrary.elementPrefix || "node-input-";
        var name = $("#"+elementPrefix+"name").val().trim();
        if (name === "") {
            name = RED._("library.unnamedType",{type:activeLibrary.type});
        }
        var filename = $("#red-ui-library-dialog-save-filename").val().trim()
        var selectedPath = saveLibraryBrowser.getSelected();
        if (!selectedPath.children) {
            selectedPath = selectedPath.parent;
        }

        var queryArgs = [];
        var data = {};
        for (var i=0; i < activeLibrary.fields.length; i++) {
            var field = activeLibrary.fields[i];
            if (field === "name") {
                data.name = name;
            } else if (typeof(field) === 'object') {
                data[field.name] = field.get();
            } else {
                data[field] = $("#" + elementPrefix + field).val();
            }
        }
        data.text = activeLibrary.editor.getValue();
        var saveFlow = function() {
            $.ajax({
                url:"library/"+selectedPath.library+'/'+selectedPath.type+'/'+selectedPath.path + filename,
                type: "POST",
                data: JSON.stringify(data),
                contentType: "application/json; charset=utf-8"
            }).done(function(data,textStatus,xhr) {
                RED.notify(RED._("library.savedType", {type:activeLibrary.type}),"success");
            }).fail(function(xhr,textStatus,err) {
                if (xhr.status === 401) {
                    RED.notify(RED._("library.saveFailed",{message:RED._("user.notAuthorized")}),"error");
                } else {
                    RED.notify(RED._("library.saveFailed",{message:xhr.responseText}),"error");
                }
            });
        }
        if (selectedPath.children) {
            var exists = false;
            selectedPath.children.forEach(function(f) {
                if (f.label === filename) {
                    exists = true;
                }
            });
            if (exists) {
                $( "#red-ui-library-dialog-save" ).dialog("close");
                var notification = RED.notify(RED._("clipboard.export.exists",{file:RED.utils.sanitize(filename)}),{
                    type: "warning",
                    fixed: true,
                    buttons: [{
                        text: RED._("common.label.cancel"),
                        click: function() {
                            notification.hideNotification()
                            $( "#red-ui-library-dialog-save" ).dialog( "open" );
                        }
                    },{
                        text: RED._("clipboard.export.overwrite"),
                        click: function() {
                            notification.hideNotification()
                            saveFlow();
                        }
                    }]
                });
            } else {
                saveFlow();
            }
        } else {
            saveFlow();
        }
    }

    function loadLibraryFolder(library,type,root,done) {
        $.getJSON("library/"+library+"/"+type+"/"+root,function(data) {
            var items = data.map(function(d) {
                if (typeof d === "string") {
                    return {
                        library: library,
                        type: type,
                        icon: 'fa fa-folder',
                        label: d,
                        path: root+d+"/",
                        children: function(done, item) {
                            loadLibraryFolder(library,type,root+d+"/", function(children) {
                                item.children = children; // TODO: should this be done by treeList for us
                                done(children);
                            })
                        }
                    };
                } else {
                    return {
                        library: library,
                        type: type,
                        icon: 'fa fa-file-o',
                        label: d.fn,
                        path: root+d.fn,
                        props: d
                    };
                }
            });
            items.sort(function(A,B){
                if (A.children && !B.children) {
                    return -1;
                } else if (!A.children && B.children) {
                    return 1;
                } else {
                    return A.label.localeCompare(B.label);
                }
            });
            done(items);
        });
    }

    var validateExportFilenameTimeout;
    function validateExportFilename(filenameInput) {
        if (validateExportFilenameTimeout) {
            clearTimeout(validateExportFilenameTimeout);
        }
        validateExportFilenameTimeout = setTimeout(function() {
            var filename = filenameInput.val().trim();
            var valid = filename.length > 0 && !/[\/\\]/.test(filename);
            if (valid) {
                filenameInput.removeClass("input-error");
                $("#red-ui-library-dialog-save-button").button("enable");
            } else {
                filenameInput.addClass("input-error");
                $("#red-ui-library-dialog-save-button").button("disable");
            }
        },100);
    }

    function createUI(options) {
        var libraryData = {};
        var elementPrefix = options.elementPrefix || "node-input-";

        // Orion editor has set/getText
        // ACE editor has set/getValue
        // normalise to set/getValue
        if (options.editor.setText) {
            // Orion doesn't like having pos passed in, so proxy the call to drop it
            options.editor.setValue = function(text,pos) {
                options.editor.setText.call(options.editor,text);
            }
        }
        if (options.editor.getText) {
            options.editor.getValue = options.editor.getText;
        }

        // Add the library button to the name <input> in the edit dialog
        $('#'+elementPrefix+"name").css("width","calc(100% - 52px)").after(
            '<div style="margin-left:5px; display: inline-block;position: relative;">'+
            '<a id="node-input-'+options.type+'-lookup" class="red-ui-button"><i class="fa fa-book"></i> <i class="fa fa-caret-down"></i></a>'+
            '</div>'

            // '<ul class="red-ui-menu-dropdown pull-right" role="menu">'+
            // '<li><a id="node-input-'+options.type+'-menu-open-library" tabindex="-1" href="#">'+RED._("library.openLibrary")+'</a></li>'+
            // '<li><a id="node-input-'+options.type+'-menu-save-library" tabindex="-1" href="#">'+RED._("library.saveToLibrary")+'</a></li>'+
            // '</ul></div>'
        );
        RED.menu.init({id:'node-input-'+options.type+'-lookup', options: [
            { id:'node-input-'+options.type+'-menu-open-library',
                label: RED._("library.openLibrary"),
                onselect: function() {
                    activeLibrary = options;
                    loadLibraryFolder("local",options.url, "", function(items) {
                        var listing = [{
                            library: "local",
                            type: options.url,
                            icon: 'fa fa-hdd-o',
                            label: RED._("library.types.local"),
                            path: "",
                            expanded: true,
                            writable: false,
                            children: [{
                                library: "local",
                                type: options.url,
                                icon: 'fa fa-cube',
                                label: options.type,
                                path: "",
                                expanded: true,
                                children: items
                            }]
                        }]
                        loadLibraryBrowser.data(listing);
                        setTimeout(function() {
                            loadLibraryBrowser.select(listing[0].children[0]);
                        },200);
                    });
                    libraryEditor = ace.edit('red-ui-library-dialog-load-preview-text',{
                        useWorker: false
                    });
                    libraryEditor.setTheme("ace/theme/tomorrow");
                    if (options.mode) {
                        libraryEditor.getSession().setMode(options.mode);
                    }
                    libraryEditor.setOptions({
                        readOnly: true,
                        highlightActiveLine: false,
                        highlightGutterLine: false
                    });
                    libraryEditor.renderer.$cursorLayer.element.style.opacity=0;
                    libraryEditor.$blockScrolling = Infinity;

                    var dialogHeight = 400;
                    var winHeight = $(window).height();
                    if (winHeight < 570) {
                        dialogHeight = 400 - (570 - winHeight);
                    }
                    $("#red-ui-library-dialog-load .red-ui-library-dialog-box").height(dialogHeight);

                    $( "#red-ui-library-dialog-load" ).dialog("option","title",RED._("library.typeLibrary", {type:options.type})).dialog( "open" );
                }
            },
            { id:'node-input-'+options.type+'-menu-save-library',
                label: RED._("library.saveToLibrary"),
                onselect: function() {
                    activeLibrary = options;
                    //var found = false;
                    var name = $("#"+elementPrefix+"name").val().replace(/(^\s*)|(\s*$)/g,"");
                    var filename = name.replace(/[^\w-]/g,"-");
                    if (filename === "") {
                        filename = "unnamed-"+options.type;
                    }
                    $("#red-ui-library-dialog-save-filename").attr("value",filename+"."+(options.ext||"txt"));

                    loadLibraryFolder("local",options.url, "", function(items) {
                        var listing = [{
                            library: "local",
                            type: options.url,
                            icon: 'fa fa-hdd-o',
                            label: RED._("library.types.local"),
                            path: "",
                            expanded: true,
                            writable: false,
                            children: [{
                                library: "local",
                                type: options.url,
                                icon: 'fa fa-cube',
                                label: options.type,
                                path: "",
                                expanded: true,
                                children: items
                            }]
                        }]
                        saveLibraryBrowser.data(listing);
                        setTimeout(function() {
                            saveLibraryBrowser.select(listing[0].children[0]);
                        },200);
                    });

                    var dialogHeight = 400;
                    var winHeight = $(window).height();
                    if (winHeight < 570) {
                        dialogHeight = 400 - (570 - winHeight);
                    }
                    $("#red-ui-library-dialog-save .red-ui-library-dialog-box").height(dialogHeight);


                    $( "#red-ui-library-dialog-save" ).dialog( "open" );
                }
            }
        ]})
    }

    function exportFlow() {
        console.warn("Deprecated call to RED.library.export");
    }

    var menuOptionMenu;
    function createBrowser(options) {
        var panes = $('<div class="red-ui-library-browser"></div>').appendTo(options.container);
        var dirList = $("<div>").css({width: "100%", height: "100%"}).appendTo(panes)
            .treeList({}).on('treelistselect', function(event, item) {
                if (options.onselect) {
                    options.onselect(item);
                }
            }).on('treelistconfirm', function(event, item) {
                if (options.onconfirm) {
                    options.onconfirm(item);
                }
            });
        var itemTools = $("<div>").css({position: "absolute",bottom:"6px",right:"8px"});
        var menuButton = $('<button class="red-ui-button red-ui-button-small" type="button"><i class="fa fa-ellipsis-h"></i></button>')
            .on("click", function(evt) {
                evt.preventDefault();
                evt.stopPropagation();
                var elementPos = menuButton.offset();

                var menuOptionMenu = RED.menu.init({id:"red-ui-library-browser-menu",
                    options: [
                        {id:"red-ui-library-browser-menu-addFolder",label:RED._("library.newFolder"), onselect: function() {
                            var defaultFolderName = "new-folder";
                            var defaultFolderNameMatches = {};

                            var selected = dirList.treeList('selected');
                            if (!selected.children) {
                                selected = selected.parent;
                            }
                            var complete = function() {
                                selected.children.forEach(function(c) {
                                    if (/^new-folder/.test(c.label)) {
                                        defaultFolderNameMatches[c.label] = true
                                    }
                                });
                                var folderIndex = 2;
                                while(defaultFolderNameMatches[defaultFolderName]) {
                                    defaultFolderName = "new-folder-"+(folderIndex++)
                                }

                                selected.treeList.expand();
                                var input = $('<input type="text" class="red-ui-treeList-input">').val(defaultFolderName);
                                var newItem = {
                                    icon: "fa fa-folder-o",
                                    children:[],
                                    path: selected.path,
                                    element: input
                                }
                                var confirmAdd = function() {
                                    var val = input.val().trim();
                                    if (val === "") {
                                        cancelAdd();
                                        return;
                                    } else {
                                        for (var i=0;i<selected.children.length;i++) {
                                            if (selected.children[i].label === val) {
                                                cancelAdd();
                                                return;
                                            }
                                        }
                                    }
                                    newItem.treeList.remove();
                                    var finalItem = {
                                        library: selected.library,
                                        type: selected.type,
                                        icon: "fa fa-folder",
                                        children:[],
                                        label: val,
                                        path: newItem.path+val+"/"
                                    }
                                    selected.treeList.addChild(finalItem,true);
                                }
                                var cancelAdd = function() {
                                    newItem.treeList.remove();
                                }
                                input.on('keydown', function(evt) {
                                    evt.stopPropagation();
                                    if (evt.keyCode === 13) {
                                        confirmAdd();
                                    } else if (evt.keyCode === 27) {
                                        cancelAdd();
                                    }
                                })
                                input.on("blur", function() {
                                    confirmAdd();
                                })
                                selected.treeList.addChild(newItem);
                                setTimeout(function() {
                                    input.trigger("focus");
                                    input.select();
                                },400);
                            }
                            selected.treeList.expand(complete);

                        } },
                        // null,
                        // {id:"red-ui-library-browser-menu-rename",label:"Rename", onselect: function() {} },
                        // {id:"red-ui-library-browser-menu-delete",label:"Delete", onselect: function() {} }
                    ]
                }).on('mouseleave', function(){ $(this).remove(); dirList.focus() })
                  .on('mouseup', function() { var self = $(this);self.hide(); dirList.focus(); setTimeout(function() { self.remove() },100)})
                  .appendTo("body");
                menuOptionMenu.css({
                    position: "absolute",
                    top: elementPos.top+"px",
                    left: (elementPos.left - menuOptionMenu.width() + 20)+"px"
                }).show();

            }).appendTo(itemTools);
        if (options.folderTools) {
            dirList.on('treelistselect', function(event, item) {
                if (item.writable !== false && item.treeList) {
                    itemTools.appendTo(item.treeList.label);
                }
            });
        }

        return {
            select: function(item) {
                dirList.treeList('select',item);
            },
            getSelected: function() {
                return dirList.treeList('selected');
            },
            focus: function() {
                dirList.focus();
            },
            data: function(content,selectFirst) {
                dirList.treeList('data',content);
                if (selectFirst) {
                    setTimeout(function() {
                        dirList.treeList('select',content[0]);
                    },100);
                }
            }
        }
    }

    return {
        init: function() {

            $(_librarySave).appendTo("#red-ui-editor").i18n();
            $(_libraryLookup).appendTo("#red-ui-editor").i18n();

            $( "#red-ui-library-dialog-save" ).dialog({
                title: RED._("library.saveToLibrary"),
                modal: true,
                autoOpen: false,
                width: 800,
                resizable: false,
                open: function( event, ui ) { RED.keyboard.disable() },
                close: function( event, ui ) { RED.keyboard.enable() },
                classes: {
                    "ui-dialog": "red-ui-editor-dialog",
                    "ui-dialog-titlebar-close": "hide",
                    "ui-widget-overlay": "red-ui-editor-dialog"
                },
                buttons: [
                    {
                        text: RED._("common.label.cancel"),
                        click: function() {
                            $( this ).dialog( "close" );
                        }
                    },
                    {
                        id: "red-ui-library-dialog-save-button",
                        text: RED._("common.label.save"),
                        class: "primary",
                        click: function() {
                            saveToLibrary(false);
                            $( this ).dialog( "close" );
                        }
                    }
                ]
            });

            saveLibraryBrowser = RED.library.createBrowser({
                container: $("#red-ui-library-dialog-save-browser"),
                folderTools: true,
                onselect: function(item) {
                    if (item.label) {
                        if (!item.children) {
                            $("#red-ui-library-dialog-save-filename").val(item.label);
                            item = item.parent;
                        }
                        if (item.writable === false) {
                            $("#red-ui-library-dialog-save-button").button("disable");
                        } else {
                            $("#red-ui-library-dialog-save-button").button("enable");
                        }
                    }
                }
            });
            $("#red-ui-library-dialog-save-filename").on("keyup", function() { validateExportFilename($(this))});
            $("#red-ui-library-dialog-save-filename").on('paste',function() { var input = $(this); setTimeout(function() { validateExportFilename(input)},10)});

            $( "#red-ui-library-dialog-load" ).dialog({
                modal: true,
                autoOpen: false,
                width: 800,
                resizable: false,
                classes: {
                    "ui-dialog": "red-ui-editor-dialog",
                    "ui-dialog-titlebar-close": "hide",
                    "ui-widget-overlay": "red-ui-editor-dialog"
                },
                buttons: [
                    {
                        text: RED._("common.label.cancel"),
                        click: function() {
                            $( this ).dialog( "close" );
                        }
                    },
                    {
                        text: RED._("common.label.load"),
                        class: "primary",
                        click: function () {
                            if (selectedLibraryItem) {
                                var elementPrefix = activeLibrary.elementPrefix || "node-input-";
                                for (var i = 0; i < activeLibrary.fields.length; i++) {
                                    var field = activeLibrary.fields[i];
                                    if (typeof(field) === 'object') {
                                        var val = selectedLibraryItem[field.name];
                                        field.set(val);
                                    }
                                    else {
                                        $("#"+elementPrefix+field).val(selectedLibraryItem[field]);
                                    }
                                }
                                activeLibrary.editor.setValue(libraryEditor.getValue(), -1);
                            }
                            $( this ).dialog( "close" );
                        }
                    }
                ],
                open: function(e) {
                    RED.keyboard.disable();
                    $(this).parent().find(".ui-dialog-titlebar-close").hide();
                },
                close: function(e) {
                    RED.keyboard.enable();
                    if (libraryEditor) {
                        libraryEditor.destroy();
                        libraryEditor = null;
                    }
                }
            });
            loadLibraryBrowser = RED.library.createBrowser({
                container: $("#red-ui-library-dialog-load-browser"),
                onselect: function(file) {
                    var table = $("#red-ui-library-dialog-load-preview-details-table").empty();
                    selectedLibraryItem = file.props;
                    if (file && file.label && !file.children) {
                        $.get("library/"+file.library+"/"+file.type+"/"+file.path, function(data) {
                            //TODO: nls + sanitize
                            var propRow = $('<tr class="red-ui-help-info-row"><td>Type</td><td></td></tr>').appendTo(table);
                            $(propRow.children()[1]).text(activeLibrary.type);
                            if (file.props.hasOwnProperty('name')) {
                                propRow = $('<tr class="red-ui-help-info-row"><td>Name</td><td>'+file.props.name+'</td></tr>').appendTo(table);
                                $(propRow.children()[1]).text(file.props.name);
                            }
                            for (var p in file.props) {
                                if (file.props.hasOwnProperty(p) && p !== 'name' && p !== 'fn') {
                                    propRow = $('<tr class="red-ui-help-info-row"><td></td><td></td></tr>').appendTo(table);
                                    $(propRow.children()[0]).text(p);
                                    RED.utils.createObjectElement(file.props[p]).appendTo(propRow.children()[1]);
                                }
                            }
                            libraryEditor.setValue(data,-1);
                        });
                    } else {
                        libraryEditor.setValue("",-1);
                    }
                }
            });
            RED.panels.create({
                container:$("#red-ui-library-dialog-load-panes"),
                dir: "horizontal",
                resize: function() {
                    libraryEditor.resize();
                }
            });
            RED.panels.create({
                container:$("#red-ui-library-dialog-load-preview"),
                dir: "vertical",
                resize: function() {
                    libraryEditor.resize();
                }
            });
        },
        create: createUI,
        createBrowser:createBrowser,
        export: exportFlow,
        loadLibraryFolder: loadLibraryFolder
    }
})();
