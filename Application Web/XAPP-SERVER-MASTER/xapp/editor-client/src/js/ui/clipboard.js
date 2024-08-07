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


RED.clipboard = (function() {

    var dialog;
    var dialogContainer;
    var exportNodesDialog;
    var importNodesDialog;
    var disabled = false;
    var popover;
    var currentPopoverError;
    var activeTab;
    var libraryBrowser;
    var examplesBrowser;

    var pendingImportConfig;

    function setupDialogs() {
        dialog = $('<div id="red-ui-clipboard-dialog" class="hide"><form class="dialog-form form-horizontal"></form></div>')
            .appendTo("#red-ui-editor")
            .dialog({
                modal: true,
                autoOpen: false,
                width: 700,
                resizable: false,
                classes: {
                    "ui-dialog": "red-ui-editor-dialog",
                    "ui-dialog-titlebar-close": "hide",
                    "ui-widget-overlay": "red-ui-editor-dialog"
                },
                buttons: [
                    { // red-ui-clipboard-dialog-cancel
                        id: "red-ui-clipboard-dialog-cancel",
                        text: RED._("common.label.cancel"),
                        click: function() {
                            $( this ).dialog( "close" );
                        }
                    },
                    { // red-ui-clipboard-dialog-download
                        id: "red-ui-clipboard-dialog-download",
                        class: "primary",
                        text: RED._("clipboard.download"),
                        click: function() {
                            var element = document.createElement('a');
                            element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent($("#red-ui-clipboard-dialog-export-text").val()));
                            element.setAttribute('download', "flows.json");
                            element.style.display = 'none';
                            document.body.appendChild(element);
                            element.click();
                            document.body.removeChild(element);
                            $( this ).dialog( "close" );
                        }
                    },
                    { // red-ui-clipboard-dialog-export
                        id: "red-ui-clipboard-dialog-export",
                        class: "primary",
                        text: RED._("clipboard.export.copy"),
                        click: function() {
                            if (activeTab === "red-ui-clipboard-dialog-export-tab-clipboard") {
                                $("#red-ui-clipboard-dialog-export-text").select();
                                document.execCommand("copy");
                                document.getSelection().removeAllRanges();
                                RED.notify(RED._("clipboard.nodesExported"),{id:"clipboard"});
                                $( this ).dialog( "close" );
                            } else {
                                var flowToExport = $("#red-ui-clipboard-dialog-export-text").val();
                                var selectedPath = libraryBrowser.getSelected();
                                if (!selectedPath.children) {
                                    selectedPath = selectedPath.parent;
                                }
                                var filename = $("#red-ui-clipboard-dialog-tab-library-name").val().trim();
                                var saveFlow = function() {
                                    $.ajax({
                                        url:'library/'+selectedPath.library+'/'+selectedPath.type+'/'+selectedPath.path + filename,
                                        type: "POST",
                                        data: flowToExport,
                                        contentType: "application/json; charset=utf-8"
                                    }).done(function() {
                                        $(dialog).dialog( "close" );
                                        RED.notify(RED._("library.exportedToLibrary"),"success");
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
                                        dialog.dialog("close");
                                        var notification = RED.notify(RED._("clipboard.export.exists",{file:RED.utils.sanitize(filename)}),{
                                            type: "warning",
                                            fixed: true,
                                            buttons: [{
                                                text: RED._("common.label.cancel"),
                                                click: function() {
                                                    notification.hideNotification()
                                                    dialog.dialog( "open" );
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
                        }
                    },
                    { // red-ui-clipboard-dialog-ok
                        id: "red-ui-clipboard-dialog-ok",
                        class: "primary",
                        text: RED._("common.label.import"),
                        click: function() {
                            var addNewFlow = ($("#red-ui-clipboard-dialog-import-opt > a.selected").attr('id') === 'red-ui-clipboard-dialog-import-opt-new');
                            if (activeTab === "red-ui-clipboard-dialog-import-tab-clipboard") {
                                importNodes($("#red-ui-clipboard-dialog-import-text").val(),addNewFlow);
                            } else {
                                var selectedPath;
                                if (activeTab === "red-ui-clipboard-dialog-import-tab-library") {
                                    selectedPath = libraryBrowser.getSelected();
                                } else {
                                    selectedPath = examplesBrowser.getSelected();
                                }
                                if (selectedPath.path) {
                                    $.get('library/'+selectedPath.library+'/'+selectedPath.type+'/'+selectedPath.path, function(data) {
                                        importNodes(data,addNewFlow);
                                    });
                                }
                            }
                            $( this ).dialog( "close" );
                        }
                    },
                    { // red-ui-clipboard-dialog-import-conflict
                        id: "red-ui-clipboard-dialog-import-conflict",
                        class: "primary",
                        text: RED._("clipboard.import.importSelected"),
                        click: function() {
                            var importMap = {};
                            $('#red-ui-clipboard-dialog-import-conflicts-list input[type="checkbox"]').each(function() {
                                importMap[$(this).attr("data-node-id")] = this.checked?"import":"skip";
                            })

                            $('.red-ui-clipboard-dialog-import-conflicts-controls input[type="checkbox"]').each(function() {
                                if (!$(this).attr("disabled")) {
                                    importMap[$(this).attr("data-node-id")] = this.checked?"replace":"copy"
                                }
                            })
                            // skip - don't import
                            // import - import as-is
                            // copy - import with new id
                            // replace - import over the top of existing
                            pendingImportConfig.importOptions.importMap = importMap;

                            var newNodes = pendingImportConfig.importNodes.filter(function(n) {
                                if (!importMap[n.id] || importMap[n.z]) {
                                    importMap[n.id] = importMap[n.z];
                                }
                                return importMap[n.id] !== "skip"
                            })
                            // console.table(pendingImportConfig.importNodes.map(function(n) { return {id:n.id,type:n.type,result:importMap[n.id]}}))
                            RED.view.importNodes(newNodes, pendingImportConfig.importOptions);
                            $( this ).dialog( "close" );
                        }
                    }
                ],
                open: function( event, ui ) {
                    RED.keyboard.disable();
                },
                close: function(e) {
                    RED.keyboard.enable();
                    if (popover) {
                        popover.close(true);
                        currentPopoverError = null;
                    }
                }
            });

        dialogContainer = dialog.children(".dialog-form");

        exportNodesDialog =
            '<div class="form-row">'+
                '<label style="width:auto;margin-right: 10px;" data-i18n="common.label.export"></label>'+
                '<span id="red-ui-clipboard-dialog-export-rng-group" class="button-group">'+
                    '<a id="red-ui-clipboard-dialog-export-rng-selected" class="red-ui-button toggle" href="#" data-i18n="clipboard.export.selected"></a>'+
                    '<a id="red-ui-clipboard-dialog-export-rng-flow" class="red-ui-button toggle" href="#" data-i18n="clipboard.export.current"></a>'+
                    '<a id="red-ui-clipboard-dialog-export-rng-full" class="red-ui-button toggle" href="#" data-i18n="clipboard.export.all"></a>'+
                '</span>'+
            '</div>'+
            '<div class="red-ui-clipboard-dialog-box">'+
                '<div class="red-ui-clipboard-dialog-tabs">'+
                    '<ul id="red-ui-clipboard-dialog-export-tabs"></ul>'+
                '</div>'+
                '<div id="red-ui-clipboard-dialog-export-tabs-content" class="red-ui-clipboard-dialog-tabs-content">'+
                    '<div id="red-ui-clipboard-dialog-export-tab-clipboard" class="red-ui-clipboard-dialog-tab-clipboard">'+
                        '<div class="form-row" style="height:calc(100% - 30px)">'+
                            '<textarea readonly id="red-ui-clipboard-dialog-export-text"></textarea>'+
                        '</div>'+
                        '<div class="form-row" style="text-align: right;">'+
                            '<span id="red-ui-clipboard-dialog-export-fmt-group" class="button-group">'+
                                '<a id="red-ui-clipboard-dialog-export-fmt-mini" class="red-ui-button red-ui-button-small toggle" href="#" data-i18n="clipboard.export.compact"></a>'+
                                '<a id="red-ui-clipboard-dialog-export-fmt-full" class="red-ui-button red-ui-button-small toggle" href="#" data-i18n="clipboard.export.formatted"></a>'+
                            '</span>'+
                        '</div>'+
                    '</div>'+
                    '<div id="red-ui-clipboard-dialog-export-tab-library" class="red-ui-clipboard-dialog-tab-library">'+
                        '<div id="red-ui-clipboard-dialog-export-tab-library-browser"></div>'+
                        '<div class="form-row">'+
                            '<label data-i18n="clipboard.export.exportAs"></label><input id="red-ui-clipboard-dialog-tab-library-name" type="text">'+
                        '</div>'+
                    '</div>'+
                '</div>'+
            '</div>'
            ;


        importNodesDialog =
            '<div class="red-ui-clipboard-dialog-box" style="margin-bottom: 12px">'+
                '<div class="red-ui-clipboard-dialog-tabs">'+
                    '<ul id="red-ui-clipboard-dialog-import-tabs"></ul>'+
                '</div>'+
                '<div id="red-ui-clipboard-dialog-import-tabs-content" class="red-ui-clipboard-dialog-tabs-content">'+
                    '<div id="red-ui-clipboard-dialog-import-tab-clipboard" class="red-ui-clipboard-dialog-tab-clipboard">'+
                        '<div class="form-row"><span data-i18n="clipboard.pasteNodes"></span>'+
                            ' <a class="red-ui-button" id="red-ui-clipboard-dialog-import-file-upload-btn"><i class="fa fa-upload"></i> <span data-i18n="clipboard.selectFile"></span></a>'+
                            '<input type="file" id="red-ui-clipboard-dialog-import-file-upload" accept=".json" style="display:none">'+
                        '</div>'+
                        '<div class="form-row" style="height:calc(100% - 47px)">'+
                            '<textarea id="red-ui-clipboard-dialog-import-text"></textarea>'+
                        '</div>'+
                    '</div>'+
                    '<div id="red-ui-clipboard-dialog-import-tab-library" class="red-ui-clipboard-dialog-tab-library"></div>'+
                    '<div id="red-ui-clipboard-dialog-import-tab-examples" class="red-ui-clipboard-dialog-tab-library"></div>'+
                '</div>'+
            '</div>'+
            '<div class="form-row">'+
                '<label style="width:auto;margin-right: 10px;" data-i18n="clipboard.import.import"></label>'+
                '<span id="red-ui-clipboard-dialog-import-opt" class="button-group">'+
                    '<a id="red-ui-clipboard-dialog-import-opt-current" class="red-ui-button toggle selected" href="#" data-i18n="clipboard.export.current"></a>'+
                    '<a id="red-ui-clipboard-dialog-import-opt-new" class="red-ui-button toggle" href="#" data-i18n="clipboard.import.newFlow"></a>'+
                '</span>'+
            '</div>';

            importConflictsDialog =
                '<div class="form-row">'+
                    '<div class="form-row"><p data-i18n="clipboard.import.conflictNotification1"></p><p data-i18n="clipboard.import.conflictNotification2"></p></div>'+
                    '<div class="red-ui-clipboard-dialog-import-conflicts-list-container">'+
                        '<div id="red-ui-clipboard-dialog-import-conflicts-list"></div>'+
                    '</div>'+
                '</div>';

    }

    var validateExportFilenameTimeout
    function validateExportFilename() {
        if (validateExportFilenameTimeout) {
            clearTimeout(validateExportFilenameTimeout);
        }
        validateExportFilenameTimeout = setTimeout(function() {
            var filenameInput = $("#red-ui-clipboard-dialog-tab-library-name");
            var filename = filenameInput.val().trim();
            var valid = filename.length > 0 && !/[\/\\]/.test(filename);
            if (valid) {
                filenameInput.removeClass("input-error");
                $("#red-ui-clipboard-dialog-export").button("enable");
            } else {
                filenameInput.addClass("input-error");
                $("#red-ui-clipboard-dialog-export").button("disable");
            }
        },100);
    }

    var validateImportTimeout;
    function validateImport() {
        if (activeTab === "red-ui-clipboard-dialog-import-tab-clipboard") {
            if (validateImportTimeout) {
                clearTimeout(validateImportTimeout);
            }
            validateImportTimeout = setTimeout(function() {
                var importInput = $("#red-ui-clipboard-dialog-import-text");
                var v = importInput.val().trim();
                if (v === "") {
                    popover.close(true);
                    currentPopoverError = null;
                    importInput.removeClass("input-error");
                    $("#red-ui-clipboard-dialog-ok").button("disable");
                    return;
                }
                try {
                    if (!/^\[[\s\S]*\]$/m.test(v)) {
                        throw new Error(RED._("clipboard.import.errors.notArray"));
                    }
                    var res = JSON.parse(v);
                    for (var i=0;i<res.length;i++) {
                        if (typeof res[i] !== "object") {
                            throw new Error(RED._("clipboard.import.errors.itemNotObject",{index:i}));
                        }
                        if (!res[i].hasOwnProperty('id')) {
                            throw new Error(RED._("clipboard.import.errors.missingId",{index:i}));
                        }
                        if (!res[i].hasOwnProperty('type')) {
                            throw new Error(RED._("clipboard.import.errors.missingType",{index:i}));
                        }
                    }
                    currentPopoverError = null;
                    popover.close(true);
                    importInput.removeClass("input-error");
                    importInput.val(v);
                    $("#red-ui-clipboard-dialog-ok").button("enable");
                } catch(err) {
                    if (v !== "") {
                        importInput.addClass("input-error");
                        var errString = err.toString();
                        if (errString !== currentPopoverError) {
                            // Display the error as-is.
                            // Error messages are only in English. Each browser has its
                            // own set of messages with very little consistency.
                            // To provide translated messages this code will either need to:
                            // - reduce everything down to 'unexpected token at position x'
                            //   which is the least useful, but most consistent message
                            // - use a custom/library parser that gives consistent messages
                            //   which can be translated.
                            var message = $('<div class="red-ui-clipboard-import-error"></div>').text(errString);
                            var errorPos;
                            // Chrome error messages
                            var m = /at position (\d+)/i.exec(errString);
                            if (m) {
                                errorPos = parseInt(m[1]);
                            } else {
                                // Firefox error messages
                                m = /at line (\d+) column (\d+)/i.exec(errString);
                                if (m) {
                                    var line = parseInt(m[1])-1;
                                    var col = parseInt(m[2])-1;
                                    var lines = v.split("\n");
                                    errorPos = 0;
                                    for (var i=0;i<line;i++) {
                                        errorPos += lines[i].length+1;
                                    }
                                    errorPos += col;
                                } else {
                                    // Safari doesn't provide any position information
                                    // IE: tbd
                                }
                            }

                            if (errorPos !== undefined) {
                                v = v.replace(/\n/g,"↵");
                                var index = parseInt(m[1]);
                                var parseError = $('<div>').appendTo(message);
                                var code = $('<pre>').appendTo(parseError);
                                $('<span>').text(v.substring(errorPos-12,errorPos)).appendTo(code)
                                $('<span class="error">').text(v.charAt(errorPos)).appendTo(code);
                                $('<span>').text(v.substring(errorPos+1,errorPos+12)).appendTo(code);
                            }
                            popover.close(true).setContent(message).open();
                            currentPopoverError = errString;
                        }
                    } else {
                        currentPopoverError = null;
                    }
                    $("#red-ui-clipboard-dialog-ok").button("disable");
                }
            },100);
        } else {
            var file = libraryBrowser.getSelected();
            if (file && file.label && !file.children) {
                $("#red-ui-clipboard-dialog-ok").button("enable");
            } else {
                $("#red-ui-clipboard-dialog-ok").button("disable");
            }
        }
    }

    function showImportNodes(mode) {
        if (disabled) {
            return;
        }
        mode = mode || "clipboard";

        dialogContainer.empty();
        dialogContainer.append($(importNodesDialog));

        var tabs = RED.tabs.create({
            id: "red-ui-clipboard-dialog-import-tabs",
            vertical: true,
            onchange: function(tab) {
                $("#red-ui-clipboard-dialog-import-tabs-content").children().hide();
                $("#" + tab.id).show();
                activeTab = tab.id;
                if (popover) {
                    popover.close(true);
                    currentPopoverError = null;
                }
                if (tab.id === "red-ui-clipboard-dialog-import-tab-clipboard") {
                    $("#red-ui-clipboard-dialog-import-text").trigger("focus");
                } else {
                    libraryBrowser.focus();
                }
                validateImport();
            }
        });
        tabs.addTab({
            id: "red-ui-clipboard-dialog-import-tab-clipboard",
            label: RED._("clipboard.clipboard")
        });
        tabs.addTab({
            id: "red-ui-clipboard-dialog-import-tab-library",
            label: RED._("library.library")
        });
        tabs.addTab({
            id: "red-ui-clipboard-dialog-import-tab-examples",
            label: RED._("library.types.examples")
        });

        $("#red-ui-clipboard-dialog-tab-library-name").on("keyup", validateExportFilename);
        $("#red-ui-clipboard-dialog-tab-library-name").on('paste',function() { setTimeout(validateExportFilename,10)});
        $("#red-ui-clipboard-dialog-export").button("enable");

        libraryBrowser = RED.library.createBrowser({
            container: $("#red-ui-clipboard-dialog-import-tab-library"),
            onselect: function(file) {
                if (file && file.label && !file.children) {
                    $("#red-ui-clipboard-dialog-ok").button("enable");
                } else {
                    $("#red-ui-clipboard-dialog-ok").button("disable");
                }
            },
            onconfirm: function(item) {
                if (item && item.label && !item.children) {
                    $("#red-ui-clipboard-dialog-ok").trigger("click");
                }
            }
        })
        loadFlowLibrary(libraryBrowser,"local",RED._("library.types.local"));

        examplesBrowser = RED.library.createBrowser({
            container: $("#red-ui-clipboard-dialog-import-tab-examples"),
            onselect: function(file) {
                if (file && file.label && !file.children) {
                    $("#red-ui-clipboard-dialog-ok").button("enable");
                } else {
                    $("#red-ui-clipboard-dialog-ok").button("disable");
                }
            },
            onconfirm: function(item) {
                if (item && item.label && !item.children) {
                    $("#red-ui-clipboard-dialog-ok").trigger("click");
                }
            }
        })
        loadFlowLibrary(examplesBrowser,"_examples_",RED._("library.types.examples"));


        dialogContainer.i18n();

        $("#red-ui-clipboard-dialog-ok").show();
        $("#red-ui-clipboard-dialog-cancel").show();
        $("#red-ui-clipboard-dialog-export").hide();
        $("#red-ui-clipboard-dialog-download").hide();
        $("#red-ui-clipboard-dialog-import-conflict").hide();

        $("#red-ui-clipboard-dialog-ok").button("disable");
        $("#red-ui-clipboard-dialog-import-text").on("keyup", validateImport);
        $("#red-ui-clipboard-dialog-import-text").on('paste',function() { setTimeout(validateImport,10)});

        $("#red-ui-clipboard-dialog-import-opt > a").on("click", function(evt) {
            evt.preventDefault();
            if ($(this).hasClass('disabled') || $(this).hasClass('selected')) {
                return;
            }
            $(this).parent().children().removeClass('selected');
            $(this).addClass('selected');
        });

        $("#red-ui-clipboard-dialog-import-file-upload").on("change", function() {
            var fileReader = new FileReader();
            fileReader.onload = function () {
                $("#red-ui-clipboard-dialog-import-text").val(fileReader.result);
                validateImport();
            };
            fileReader.readAsText($(this).prop('files')[0]);
        })
        $("#red-ui-clipboard-dialog-import-file-upload-btn").on("click", function(evt) {
            evt.preventDefault();
            $("#red-ui-clipboard-dialog-import-file-upload").trigger("click");
        })

        tabs.activateTab("red-ui-clipboard-dialog-import-tab-"+mode);
        if (mode === 'clipboard') {
            setTimeout(function() {
                $("#red-ui-clipboard-dialog-import-text").trigger("focus");
            },100)
        }

        var dialogHeight = 400;
        var winHeight = $(window).height();
        if (winHeight < 600) {
            dialogHeight = 400 - (600 - winHeight);
        }
        $(".red-ui-clipboard-dialog-box").height(dialogHeight);

        dialog.dialog("option","title",RED._("clipboard.importNodes"))
              .dialog("option","width",700)
              .dialog("open");
        popover = RED.popover.create({
            target: $("#red-ui-clipboard-dialog-import-text"),
            trigger: "manual",
            direction: "bottom",
            content: ""
        });
    }

    function showExportNodes(mode) {
        if (disabled) {
            return;
        }

        mode = mode || "clipboard";

        dialogContainer.empty();
        dialogContainer.append($(exportNodesDialog));

        var tabs = RED.tabs.create({
            id: "red-ui-clipboard-dialog-export-tabs",
            vertical: true,
            onchange: function(tab) {
                $("#red-ui-clipboard-dialog-export-tabs-content").children().hide();
                $("#" + tab.id).show();
                activeTab = tab.id;
                if (tab.id === "red-ui-clipboard-dialog-export-tab-clipboard") {
                    $("#red-ui-clipboard-dialog-export").button("option","label", RED._("clipboard.export.copy"))
                    $("#red-ui-clipboard-dialog-download").show();
                } else {
                    $("#red-ui-clipboard-dialog-export").button("option","label", RED._("clipboard.export.export"))
                    $("#red-ui-clipboard-dialog-download").hide();
                    libraryBrowser.focus();
                }

            }
        });
        tabs.addTab({
            id: "red-ui-clipboard-dialog-export-tab-clipboard",
            label: RED._("clipboard.clipboard")
        });
        tabs.addTab({
            id: "red-ui-clipboard-dialog-export-tab-library",
            label: RED._("library.library")
        });

        $("#red-ui-clipboard-dialog-tab-library-name").on("keyup", validateExportFilename);
        $("#red-ui-clipboard-dialog-tab-library-name").on('paste',function() { setTimeout(validateExportFilename,10)});
        $("#red-ui-clipboard-dialog-export").button("enable");

        libraryBrowser = RED.library.createBrowser({
            container: $("#red-ui-clipboard-dialog-export-tab-library-browser"),
            folderTools: true,
            onselect: function(file) {
                if (file && file.label && !file.children) {
                    $("#red-ui-clipboard-dialog-tab-library-name").val(file.label);
                }
            }
        })
        loadFlowLibrary(libraryBrowser,"local",RED._("library.types.local"));

        $("#red-ui-clipboard-dialog-tab-library-name").val("flows.json").select();

        dialogContainer.i18n();
        var format = RED.settings.flowFilePretty ? "red-ui-clipboard-dialog-export-fmt-full" : "red-ui-clipboard-dialog-export-fmt-mini";

        $("#red-ui-clipboard-dialog-export-fmt-group > a").on("click", function(evt) {
            evt.preventDefault();
            if ($(this).hasClass('disabled') || $(this).hasClass('selected')) {
                $("#red-ui-clipboard-dialog-export-text").trigger("focus");
                return;
            }
            $(this).parent().children().removeClass('selected');
            $(this).addClass('selected');

            var flow = $("#red-ui-clipboard-dialog-export-text").val();
            if (flow.length > 0) {
                var nodes = JSON.parse(flow);

                format = $(this).attr('id');
                if (format === 'red-ui-clipboard-dialog-export-fmt-full') {
                    flow = JSON.stringify(nodes,null,4);
                } else {
                    flow = JSON.stringify(nodes);
                }
                $("#red-ui-clipboard-dialog-export-text").val(flow);
                setTimeout(function() { $("#red-ui-clipboard-dialog-export-text").scrollTop(0); },50);

                $("#red-ui-clipboard-dialog-export-text").trigger("focus");
            }
        });

        $("#red-ui-clipboard-dialog-export-rng-group > a").on("click", function(evt) {
            evt.preventDefault();
            if ($(this).hasClass('disabled') || $(this).hasClass('selected')) {
                return;
            }
            $(this).parent().children().removeClass('selected');
            $(this).addClass('selected');
            var type = $(this).attr('id');
            var flow = "";
            var nodes = null;
            if (type === 'red-ui-clipboard-dialog-export-rng-selected') {
                var selection = RED.workspaces.selection();
                if (selection.length > 0) {
                    nodes = [];
                    selection.forEach(function(n) {
                        nodes.push(n);
                        nodes = nodes.concat(RED.nodes.groups(n.id));
                        nodes = nodes.concat(RED.nodes.filterNodes({z:n.id}));
                    });
                } else {
                    nodes = RED.view.selection().nodes||[];
                }
                // Don't include the subflow meta-port nodes in the exported selection
                nodes = RED.nodes.createExportableNodeSet(nodes.filter(function(n) { return n.type !== 'subflow'}));
            } else if (type === 'red-ui-clipboard-dialog-export-rng-flow') {
                var activeWorkspace = RED.workspaces.active();
                nodes = RED.nodes.groups(activeWorkspace);
                nodes = nodes.concat(RED.nodes.filterNodes({z:activeWorkspace}));
                var parentNode = RED.nodes.workspace(activeWorkspace)||RED.nodes.subflow(activeWorkspace);
                nodes.unshift(parentNode);
                nodes = RED.nodes.createExportableNodeSet(nodes);
            } else if (type === 'red-ui-clipboard-dialog-export-rng-full') {
                nodes = RED.nodes.createCompleteNodeSet(false);
            }
            if (nodes !== null) {
                if (format === "red-ui-clipboard-dialog-export-fmt-full") {
                    flow = JSON.stringify(nodes,null,4);
                } else {
                    flow = JSON.stringify(nodes);
                }
            }
            if (flow.length > 0) {
                $("#red-ui-clipboard-dialog-export").removeClass('disabled');
            } else {
                $("#red-ui-clipboard-dialog-export").addClass('disabled');
            }
            $("#red-ui-clipboard-dialog-export-text").val(flow);
            setTimeout(function() { $("#red-ui-clipboard-dialog-export-text").scrollTop(0); },50);
            $("#red-ui-clipboard-dialog-export-text").trigger("focus");
        })

        $("#red-ui-clipboard-dialog-ok").hide();
        $("#red-ui-clipboard-dialog-cancel").hide();
        $("#red-ui-clipboard-dialog-export").hide();
        $("#red-ui-clipboard-dialog-import-conflict").hide();

        var selection = RED.workspaces.selection();
        if (selection.length > 0) {
            $("#red-ui-clipboard-dialog-export-rng-selected").trigger("click");
        } else {
            selection = RED.view.selection();
            if (selection.nodes) {
                $("#red-ui-clipboard-dialog-export-rng-selected").trigger("click");
            } else {
                $("#red-ui-clipboard-dialog-export-rng-selected").addClass('disabled').removeClass('selected');
                $("#red-ui-clipboard-dialog-export-rng-flow").trigger("click");
            }
        }
        if (format === "red-ui-clipboard-dialog-export-fmt-full") {
            $("#red-ui-clipboard-dialog-export-fmt-full").trigger("click");
        } else {
            $("#red-ui-clipboard-dialog-export-fmt-mini").trigger("click");
        }
        tabs.activateTab("red-ui-clipboard-dialog-export-tab-"+mode);

        var dialogHeight = 400;
        var winHeight = $(window).height();
        if (winHeight < 600) {
            dialogHeight = 400 - (600 - winHeight);
        }
        $(".red-ui-clipboard-dialog-box").height(dialogHeight);

        dialog.dialog("option","title",RED._("clipboard.exportNodes"))
              .dialog("option","width",700)
              .dialog("open");

        $("#red-ui-clipboard-dialog-export-text").trigger("focus");
        $("#red-ui-clipboard-dialog-cancel").show();
        $("#red-ui-clipboard-dialog-export").show();
        $("#red-ui-clipboard-dialog-download").show();
        $("#red-ui-clipboard-dialog-import-conflict").hide();

    }

    function loadFlowLibrary(browser,library,label) {
        // if (includeExamples) {
        //     listing.push({
        //         library: "_examples_",
        //         type: "flows",
        //         icon: 'fa fa-hdd-o',
        //         label: RED._("library.types.examples"),
        //         path: "",
        //         children: function(done,item) {
        //             RED.library.loadLibraryFolder("_examples_","flows","",function(children) {
        //                 item.children = children;
        //                 done(children);
        //             })
        //         }
        //     })
        // }
        browser.data([{
            library: library,
            type: "flows",
            icon: 'fa fa-hdd-o',
            label: label,
            path: "",
            expanded: true,
            children: function(done, item) {
                RED.library.loadLibraryFolder(library,"flows","",function(children) {
                    item.children = children;
                    done(children);
                })
            }
        }], true);

    }

    function hideDropTarget() {
        $("#red-ui-drop-target").hide();
        RED.keyboard.remove("escape");
    }
    function copyText(value,element,msg) {
        var truncated = false;
        if (typeof value !== "string" ) {
            value = JSON.stringify(value, function(key,value) {
                if (value !== null && typeof value === 'object') {
                    if (value.__enc__) {
                        if (value.hasOwnProperty('data') && value.hasOwnProperty('length')) {
                            truncated = value.data.length !== value.length;
                            return value.data;
                        }
                        if (value.type === 'function' || value.type === 'internal') {
                            return undefined
                        }
                        if (value.type === 'number') {
                            // Handle NaN and Infinity - they are not permitted
                            // in JSON. We can either substitute with a String
                            // representation or null
                            return null;
                        }
                        if (value.type === 'bigint') {
                            return value.data.toString();
                        }
                        if (value.type === 'undefined') {
                            return undefined;
                        }
                    }
                }
                return value;
            });
        }
        if (truncated) {
            msg += "_truncated";
        }
        $("#red-ui-clipboard-hidden").val(value).select();
        var result =  document.execCommand("copy");
        if (result && element) {
            var popover = RED.popover.create({
                target: element,
                direction: 'left',
                size: 'small',
                content: RED._(msg)
            });
            setTimeout(function() {
                popover.close();
            },1000);
            popover.open();
        }
        return result;
    }


    function importNodes(nodesStr,addFlow) {
        var newNodes = nodesStr;
        if (typeof nodesStr === 'string') {
            try {
                nodesStr = nodesStr.trim();
                if (nodesStr.length === 0) {
                    return;
                }
                newNodes = JSON.parse(nodesStr);
            } catch(err) {
                var e = new Error(RED._("clipboard.invalidFlow",{message:err.message}));
                e.code = "NODE_RED";
                throw e;
            }
        }
        var importOptions = {generateIds: false, addFlow: addFlow};
        try {
            RED.view.importNodes(newNodes, importOptions);
        } catch(error) {
            // Thrown for import_conflict
            confirmImport(error.importConfig, newNodes, importOptions);
        }
    }

    function confirmImport(importConfig,importNodes,importOptions) {
        var notification = RED.notify("<p>"+RED._("clipboard.import.conflictNotification1")+"</p>",{
            type: "info",
            fixed: true,
            buttons: [
                {text: RED._("common.label.cancel"), click: function() { notification.close(); }},
                {text: RED._("clipboard.import.viewNodes"), click: function() {
                    notification.close();
                    showImportConflicts(importConfig,importNodes,importOptions);
                }},
                {text: RED._("clipboard.import.importCopy"), click: function() {
                    notification.close();
                    // generateIds=true to avoid conflicts
                    // and default to the 'old' behaviour around matching
                    // config nodes and subflows
                    importOptions.generateIds = true;
                    RED.view.importNodes(importNodes, importOptions);
                }}
            ]
        })
    }

    function showImportConflicts(importConfig,importNodes,importOptions) {

        pendingImportConfig = {
            importConfig: importConfig,
            importNodes: importNodes,
            importOptions: importOptions
        }

        var id,node;
        var treeData = [];
        var container;
        var addedHeader = false;
        for (id in importConfig.subflows) {
            if (importConfig.subflows.hasOwnProperty(id)) {
                if (!addedHeader) {
                    treeData.push({gutter:$('<span data-i18n="menu.label.subflows"></span>'), label: '', class:"red-ui-clipboard-dialog-import-conflicts-item-header"})
                    addedHeader = true;
                }
                node = importConfig.subflows[id];
                var isConflicted = importConfig.conflicted[node.id];
                var isSelected = !isConflicted;
                var elements = getNodeElement(node, isConflicted, isSelected );
                container = {
                    id: node.id,
                    gutter: elements.gutter.element,
                    element: elements.element,
                    class: isSelected?"":"disabled",
                    deferBuild: true,
                    children: []
                }
                treeData.push(container);
                if (importConfig.zMap[id]) {
                    importConfig.zMap[id].forEach(function(node) {
                        var childElements = getNodeElement(node, importConfig.conflicted[node.id], isSelected, elements.gutter.cb);
                        container.children.push({
                            id: node.id,
                            gutter: childElements.gutter.element,
                            element: childElements.element,
                            class: isSelected?"":"disabled"
                        })
                    });
                }
            }
        }
        addedHeader = false;
        for (id in importConfig.tabs) {
            if (importConfig.tabs.hasOwnProperty(id)) {
                if (!addedHeader) {
                    treeData.push({gutter:$('<span data-i18n="menu.label.flows"></span>'), label: '', class:"red-ui-clipboard-dialog-import-conflicts-item-header"})
                    addedHeader = true;
                }
                node = importConfig.tabs[id];
                var isConflicted = importConfig.conflicted[node.id];
                var isSelected = true;
                var elements = getNodeElement(node, isConflicted, isSelected);
                container = {
                    id: node.id,
                    gutter: elements.gutter.element,
                    element: elements.element,
                    icon: "red-ui-icons red-ui-icons-flow",
                    deferBuild: true,
                    class: isSelected?"":"disabled",
                    children: []
                }
                treeData.push(container);
                if (importConfig.zMap[id]) {
                    importConfig.zMap[id].forEach(function(node) {
                        var childElements = getNodeElement(node, importConfig.conflicted[node.id], isSelected, elements.gutter.cb);
                        container.children.push({
                            id: node.id,
                            gutter: childElements.gutter.element,
                            element: childElements.element,
                            class: isSelected?"":"disabled"
                        })
                        // console.log("   ["+(importConfig.conflicted[node.id]?"*":" ")+"] "+node.type+" "+node.id);
                    });
                }
            }
        }
        addedHeader = false;
        var extraNodes = [];
        importConfig.all.forEach(function(node) {
            if (node.type !== "tab" && node.type !== "subflow" && !importConfig.tabs[node.z] && !importConfig.subflows[node.z]) {
                var isConflicted = importConfig.conflicted[node.id];
                var isSelected = !isConflicted || !importConfig.configs[node.id];
                var elements = getNodeElement(node, isConflicted, isSelected);
                var item = {
                    id: node.id,
                    gutter: elements.gutter.element,
                    element: elements.element,
                    class: isSelected?"":"disabled"
                }
                if (importConfig.configs[node.id]) {
                    extraNodes.push(item);
                } else {
                    if (!addedHeader) {
                        treeData.push({gutter:$('<span data-i18n="menu.label.nodes"></span>'), label: '', class:"red-ui-clipboard-dialog-import-conflicts-item-header"})
                        addedHeader = true;
                    }
                    treeData.push(item);
                }
                // console.log("["+(importConfig.conflicted[node.id]?"*":" ")+"] "+node.type+" "+node.id);
            }
        })
        if (extraNodes.length > 0) {
            treeData.push({gutter:$('<span data-i18n="menu.label.displayConfig"></span>'), label: '', class:"red-ui-clipboard-dialog-import-conflicts-item-header"})
            addedHeader = true;
            treeData = treeData.concat(extraNodes);

        }
        dialogContainer.empty();
        dialogContainer.append($(importConflictsDialog));


        var nodeList = $("#red-ui-clipboard-dialog-import-conflicts-list").css({position:"absolute",top:0,right:0,bottom:0,left:0}).treeList({
            data: treeData
        })

        dialogContainer.i18n();
        var dialogHeight = 400;
        var winHeight = $(window).height();
        if (winHeight < 600) {
            dialogHeight = 400 - (600 - winHeight);
        }
        $(".red-ui-clipboard-dialog-box").height(dialogHeight);

        $("#red-ui-clipboard-dialog-ok").hide();
        $("#red-ui-clipboard-dialog-cancel").show();
        $("#red-ui-clipboard-dialog-export").hide();
        $("#red-ui-clipboard-dialog-download").hide();
        $("#red-ui-clipboard-dialog-import-conflict").show();


        dialog.dialog("option","title",RED._("clipboard.importNodes"))
              .dialog("option","width",500)
              .dialog( "open" );

    }

    function getNodeElement(n, isConflicted, isSelected, parent) {
        var element;
        if (n.type === "tab") {
            element = getFlowLabel(n, isSelected);
        } else {
            element = getNodeLabel(n, isConflicted, isSelected);
        }
        var controls = $('<div>',{class:"red-ui-clipboard-dialog-import-conflicts-controls"}).appendTo(element);
        controls.on("click", function(evt) { evt.stopPropagation(); });
        if (isConflicted && !parent) {
            var cb = $('<label><input '+(isSelected?'':'disabled ')+'type="checkbox" data-node-id="'+n.id+'"> <span data-i18n="clipboard.import.replace"></span></label>').appendTo(controls);
            if (n.type === "tab" || (n.type !== "subflow" && n.hasOwnProperty("x") && n.hasOwnProperty("y"))) {
                cb.hide();
            }
        }
        return {
            element: element,
            gutter: getGutter(n, isSelected, parent)
        }
    }

    function getGutter(n, isSelected, parent) {
        var span = $("<label>",{class:"red-ui-clipboard-dialog-import-conflicts-gutter"});
        var cb = $('<input data-node-id="'+n.id+'" type="checkbox" '+(isSelected?"checked":"")+'>').appendTo(span);

        if (parent) {
            cb.attr("disabled",true);
            parent.addChild(cb);
        }
        span.on("click", function(evt) {
            evt.stopPropagation();
        })
        cb.on("change", function(evt) {
            var state = this.checked;
            span.parent().toggleClass("disabled",!!!state);
            span.parent().find('.red-ui-clipboard-dialog-import-conflicts-controls  input[type="checkbox"]').attr("disabled",!!!state);
            childItems.forEach(function(c) {
                c.attr("checked",state);
                c.trigger("change");
            });
        })
        var childItems = [];

        var checkbox = {
            addChild: function(c) {
                childItems.push(c);
            }
        }

        return {
            cb: checkbox,
            element: span
        }
    }

    function getNodeLabelText(n) {
        var label = n.name || n.type+": "+n.id;
        if (n._def.label) {
            try {
                label = (typeof n._def.label === "function" ? n._def.label.call(n) : n._def.label)||"";
            } catch(err) {
                console.log("Definition error: "+n.type+".label",err);
            }
        }
        var newlineIndex = label.indexOf("\\n");
        if (newlineIndex > -1) {
            label = label.substring(0,newlineIndex)+"...";
        }
        return label;
    }

    function getFlowLabel(n) {
        n = JSON.parse(JSON.stringify(n));
        n._def = RED.nodes.getType(n.type) || {};
        if (n._def) {
            n._ = n._def._;
        }

        var div = $('<div>',{class:"red-ui-info-outline-item red-ui-info-outline-item-flow"});
        var contentDiv = $('<div>',{class:"red-ui-search-result-description red-ui-info-outline-item-label"}).appendTo(div);
        var label = (typeof n === "string")? n : n.label;
        var newlineIndex = label.indexOf("\\n");
        if (newlineIndex > -1) {
            label = label.substring(0,newlineIndex)+"...";
        }
        contentDiv.text(label);
        // A conflicted flow should not be imported by default.
        return div;
    }

    function getNodeLabel(n, isConflicted) {
        n = JSON.parse(JSON.stringify(n));
        n._def = RED.nodes.getType(n.type) || {};
        if (n._def) {
            n._ = n._def._;
        }
        var div = $('<div>',{class:"red-ui-info-outline-item"});
        RED.utils.createNodeIcon(n).appendTo(div);
        var contentDiv = $('<div>',{class:"red-ui-search-result-description"}).appendTo(div);
        var labelText = getNodeLabelText(n);
        var label = $('<div>',{class:"red-ui-search-result-node-label red-ui-info-outline-item-label"}).appendTo(contentDiv);
        if (labelText) {
            label.text(labelText)
        } else {
            label.html(n.type)
        }
        return div;
    }

    return {
        init: function() {
            setupDialogs();

            $('<input type="text" id="red-ui-clipboard-hidden" tabIndex="-1">').appendTo("#red-ui-editor");

            RED.actions.add("core:show-export-dialog",showExportNodes);
            RED.actions.add("core:show-import-dialog",showImportNodes);

            RED.actions.add("core:show-library-export-dialog",function() { showExportNodes('library') });
            RED.actions.add("core:show-library-import-dialog",function() { showImportNodes('library') });

            RED.actions.add("core:show-examples-import-dialog",function() { showImportNodes('examples') });

            RED.events.on("editor:open",function() { disabled = true; });
            RED.events.on("editor:close",function() { disabled = false; });
            RED.events.on("search:open",function() { disabled = true; });
            RED.events.on("search:close",function() { disabled = false; });
            RED.events.on("actionList:open",function() { disabled = true; });
            RED.events.on("actionList:close",function() { disabled = false; });
            RED.events.on("type-search:open",function() { disabled = true; });
            RED.events.on("type-search:close",function() { disabled = false; });

            $('<div id="red-ui-drop-target"><div data-i18n="[append]workspace.dropFlowHere"><i class="fa fa-download"></i><br></div></div>').appendTo('#red-ui-editor');

            $('#red-ui-workspace-chart').on("dragenter",function(event) {
                if ($.inArray("text/plain",event.originalEvent.dataTransfer.types) != -1 ||
                     $.inArray("Files",event.originalEvent.dataTransfer.types) != -1) {
                    $("#red-ui-drop-target").css({display:'table'});
                    RED.keyboard.add("*", "escape" ,hideDropTarget);
                }
            });

            $('#red-ui-drop-target').on("dragover",function(event) {
                if ($.inArray("text/plain",event.originalEvent.dataTransfer.types) != -1 ||
                     $.inArray("Files",event.originalEvent.dataTransfer.types) != -1) {
                    event.preventDefault();
                }
            })
            .on("dragleave",function(event) {
                hideDropTarget();
            })
            .on("drop",function(event) {
                if ($.inArray("text/plain",event.originalEvent.dataTransfer.types) != -1) {
                    var data = event.originalEvent.dataTransfer.getData("text/plain");
                    data = data.substring(data.indexOf('['),data.lastIndexOf(']')+1);
                    importNodes(data);
                } else if ($.inArray("Files",event.originalEvent.dataTransfer.types) != -1) {
                    var files = event.originalEvent.dataTransfer.files;
                    if (files.length === 1) {
                        var file = files[0];
                        var reader = new FileReader();
                        reader.onload = (function(theFile) {
                            return function(e) {
                                importNodes(e.target.result);
                            };
                        })(file);
                        reader.readAsText(file);
                    }
                }
                hideDropTarget();
                event.preventDefault();
            });

        },
        import: showImportNodes,
        export: showExportNodes,
        copyText: copyText
    }
})();
