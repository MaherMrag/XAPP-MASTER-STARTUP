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

/**
 * @namespace RED.editor
 */
RED.editor = (function() {

    var editStack = [];
    var editing_node = null;
    var editing_config_node = null;
    var subflowEditor;

    var customEditTypes = {};

    var editTrayWidthCache = {};

    function getCredentialsURL(nodeType, nodeID) {
        var dashedType = nodeType.replace(/\s+/g, '-');
        return  'credentials/' + dashedType + "/" + nodeID;
    }

    /**
     * Validate a node
     * @param node - the node being validated
     * @returns {boolean} whether the node is valid. Sets node.dirty if needed
     */
    function validateNode(node) {
        var oldValue = node.valid;
        var oldChanged = node.changed;
        node.valid = true;
        var subflow;
        var isValid;
        var validationErrors;
        var hasChanged;
        if (node.type.indexOf("subflow:")===0) {
            subflow = RED.nodes.subflow(node.type.substring(8));
            isValid = subflow.valid;
            hasChanged = subflow.changed;
            if (isValid === undefined) {
                isValid = validateNode(subflow);
                hasChanged = subflow.changed;
            }
            validationErrors = validateNodeProperties(node, node._def.defaults, node);
            node.valid = isValid && validationErrors.length === 0;
            node.changed = node.changed || hasChanged;
            node.validationErrors = validationErrors;
        } else if (node._def) {
            validationErrors = validateNodeProperties(node, node._def.defaults, node);
            if (node._def._creds) {
                validationErrors = validationErrors.concat(validateNodeProperties(node, node._def.credentials, node._def._creds))
            }
            node.valid = (validationErrors.length === 0);
            node.validationErrors = validationErrors;
        } else if (node.type == "subflow") {
            var subflowNodes = RED.nodes.filterNodes({z:node.id});
            for (var i=0;i<subflowNodes.length;i++) {
                isValid = subflowNodes[i].valid;
                hasChanged = subflowNodes[i].changed;
                if (isValid === undefined) {
                    isValid = validateNode(subflowNodes[i]);
                    hasChanged = subflowNodes[i].changed;
                }
                node.valid = node.valid && isValid;
                node.changed = node.changed || hasChanged;
            }
            var subflowInstances = RED.nodes.filterNodes({type:"subflow:"+node.id});
            var modifiedTabs = {};
            for (i=0;i<subflowInstances.length;i++) {
                subflowInstances[i].valid = node.valid;
                subflowInstances[i].changed = subflowInstances[i].changed || node.changed;
                subflowInstances[i].dirty = true;
                modifiedTabs[subflowInstances[i].z] = true;
            }
            Object.keys(modifiedTabs).forEach(function(id) {
                var subflow = RED.nodes.subflow(id);
                if (subflow) {
                    validateNode(subflow);
                }
            });
        }
        if (oldValue !== node.valid || oldChanged !== node.changed) {
            node.dirty = true;
            subflow = RED.nodes.subflow(node.z);
            if (subflow) {
                validateNode(subflow);
            }
        }
        return node.valid;
    }

    /**
     * Validate a node's properties for the given set of property definitions
     * @param node - the node being validated
     * @param definition - the node property definitions (either def.defaults or def.creds)
     * @param properties - the node property values to validate
     * @returns {array} an array of invalid properties
     */
    function validateNodeProperties(node, definition, properties) {
        var result = [];
        for (var prop in definition) {
            if (definition.hasOwnProperty(prop)) {
                if (!validateNodeProperty(node, definition, prop, properties[prop])) {
                    result.push(prop);
                }
            }
        }
        return result;
    }

    /**
     * Validate a individual node property
     * @param node - the node being validated
     * @param definition - the node property definitions (either def.defaults or def.creds)
     * @param property - the property name being validated
     * @param value - the property value being validated
     * @returns {boolean} whether the node proprty is valid
     */
    function validateNodeProperty(node,definition,property,value) {
        var valid = true;
        // Check for $(env-var) and consider it valid
        if (/^\$\([a-zA-Z_][a-zA-Z0-9_]*\)$/.test(value)) {
            return true;
        }
        // Check for ${env-var} and consider it valid
        if (/^\$\{[a-zA-Z_][a-zA-Z0-9_]*\}$/.test(value)) {
            return true;
        }
        if ("required" in definition[property] && definition[property].required) {
            valid = value !== "";
        }
        if (valid && "validate" in definition[property]) {
            try {
                valid = definition[property].validate.call(node,value);
            } catch(err) {
                console.log("Validation error:",node.type,node.id,"property: "+property,"value:",value,err);
            }
        }
        if (valid && definition[property].type && RED.nodes.getType(definition[property].type) && !("validate" in definition[property])) {
            if (!value || value == "_ADD_") {
                valid = definition[property].hasOwnProperty("required") && !definition[property].required;
            } else {
                var configNode = RED.nodes.node(value);
                valid = (configNode !== null && (configNode.valid == null || configNode.valid));
            }
        }
        return valid;
    }


    function validateNodeEditor(node,prefix) {
        for (var prop in node._def.defaults) {
            if (node._def.defaults.hasOwnProperty(prop)) {
                validateNodeEditorProperty(node,node._def.defaults,prop,prefix);
            }
        }
        if (node._def.credentials) {
            for (prop in node._def.credentials) {
                if (node._def.credentials.hasOwnProperty(prop)) {
                    validateNodeEditorProperty(node,node._def.credentials,prop,prefix);
                }
            }
        }
    }

    function validateNodeEditorProperty(node,defaults,property,prefix) {
        var input = $("#"+prefix+"-"+property);
        if (input.length > 0) {
            var value = input.val();
            if (defaults[property].hasOwnProperty("format") && defaults[property].format !== "" && input[0].nodeName === "DIV") {
                value = input.text();
            }
            if (!validateNodeProperty(node, defaults, property,value)) {
                input.addClass("input-error");
            } else {
                input.removeClass("input-error");
            }
        }
    }

    /**
     * Called when the node's properties have changed.
     * Marks the node as dirty and needing a size check.
     * Removes any links to non-existant outputs.
     * @param node - the node that has been updated
     * @param outputMap - (optional) a map of old->new port numbers if wires should be moved
     * @returns {array} the links that were removed due to this update
     */
    function updateNodeProperties(node, outputMap) {
        node.resize = true;
        node.dirty = true;
        node.dirtyStatus = true;
        var removedLinks = [];
        if (outputMap) {
            RED.nodes.eachLink(function(l) {
                if (l.source === node) {
                    if (outputMap.hasOwnProperty(l.sourcePort)) {
                        if (outputMap[l.sourcePort] === "-1") {
                            removedLinks.push(l);
                        } else {
                            l.sourcePort = outputMap[l.sourcePort];
                        }
                    }
                }
            });
        }
        if (node.hasOwnProperty("__outputs")) {
            if (node.outputs < node.__outputs) {
                RED.nodes.eachLink(function(l) {
                    if (l.source === node && l.sourcePort >= node.outputs && removedLinks.indexOf(l) === -1) {
                        removedLinks.push(l);
                    }
                });
            }
            delete node.__outputs;
        }
        node.inputs = Math.min(1,Math.max(0,parseInt(node.inputs)));
        if (isNaN(node.inputs)) {
            node.inputs = 0;
        }
        if (node.inputs === 0) {
            removedLinks = removedLinks.concat(RED.nodes.filterLinks({target:node}));
        }
        for (var l=0;l<removedLinks.length;l++) {
            RED.nodes.removeLink(removedLinks[l]);
        }
        return removedLinks;
    }

    /**
     * Create a config-node select box for this property
     * @param node - the node being edited
     * @param property - the name of the field
     * @param type - the type of the config-node
     */
    function prepareConfigNodeSelect(node,property,type,prefix) {
        var input = $("#"+prefix+"-"+property);
        if (input.length === 0 ) {
            return;
        }
        var newWidth = input.width();
        var attrStyle = input.attr('style');
        var m;
        if ((m = /width\s*:\s*(\d+(%|[a-z]+))/i.exec(attrStyle)) !== null) {
            newWidth = m[1];
        } else {
            newWidth = "70%";
        }
        var outerWrap = $("<div></div>").css({display:'inline-block',position:'relative'});
        var selectWrap = $("<div></div>").css({position:'absolute',left:0,right:'40px'}).appendTo(outerWrap);
        var select = $('<select id="'+prefix+'-'+property+'"></select>').appendTo(selectWrap);

        outerWrap.width(newWidth).height(input.height());
        if (outerWrap.width() === 0) {
            outerWrap.width("70%");
        }
        input.replaceWith(outerWrap);
        // set the style attr directly - using width() on FF causes a value of 114%...
        select.attr('style',"width:100%");
        updateConfigNodeSelect(property,type,node[property],prefix);
        $('<a id="'+prefix+'-lookup-'+property+'" class="red-ui-button"><i class="fa fa-pencil"></i></a>')
            .css({position:'absolute',right:0,top:0})
            .appendTo(outerWrap);
        $('#'+prefix+'-lookup-'+property).on("click", function(e) {
            showEditConfigNodeDialog(property,type,select.find(":selected").val(),prefix);
            e.preventDefault();
        });
        var label = "";
        var configNode = RED.nodes.node(node[property]);
        var node_def = RED.nodes.getType(type);

        if (configNode) {
            label = RED.utils.getNodeLabel(configNode,configNode.id);
        }
        input.val(label);
    }

    /**
     * Create a config-node button for this property
     * @param node - the node being edited
     * @param property - the name of the field
     * @param type - the type of the config-node
     */
    function prepareConfigNodeButton(node,property,type,prefix) {
        var input = $("#"+prefix+"-"+property);
        input.val(node[property]);
        input.attr("type","hidden");

        var button = $("<a>",{id:prefix+"-edit-"+property, class:"red-ui-button"});
        input.after(button);

        if (node[property]) {
            button.text(RED._("editor.configEdit"));
        } else {
            button.text(RED._("editor.configAdd"));
        }

        button.on("click", function(e) {
            showEditConfigNodeDialog(property,type,input.val()||"_ADD_",prefix);
            e.preventDefault();
        });
    }

    /**
     * Populate the editor dialog input field for this property
     * @param node - the node being edited
     * @param property - the name of the field
     * @param prefix - the prefix to use in the input element ids (node-input|node-config-input)
     * @param definition - the definition of the field
     */
    function preparePropertyEditor(node,property,prefix,definition) {
        var input = $("#"+prefix+"-"+property);
        if (input.length === 0) {
            return;
        }
        if (input.attr('type') === "checkbox") {
            input.prop('checked',node[property]);
        }
        else {
            var val = node[property];
            if (val == null) {
                val = "";
            }
            if (definition !== undefined && definition[property].hasOwnProperty("format") && definition[property].format !== "" && input[0].nodeName === "DIV") {
                input.html(RED.text.format.getHtml(val, definition[property].format, {}, false, "en"));
                RED.text.format.attach(input[0], definition[property].format, {}, false, "en");
            } else {
                input.val(val);
                if (input[0].nodeName === 'INPUT' || input[0].nodeName === 'TEXTAREA') {
                    RED.text.bidi.prepareInput(input);
                }
            }
        }
    }

    /**
     * Add an on-change handler to revalidate a node field
     * @param node - the node being edited
     * @param definition - the definition of the node
     * @param property - the name of the field
     * @param prefix - the prefix to use in the input element ids (node-input|node-config-input)
     */
    function attachPropertyChangeHandler(node,definition,property,prefix) {
        var input = $("#"+prefix+"-"+property);
        if (definition !== undefined && "format" in definition[property] && definition[property].format !== "" && input[0].nodeName === "DIV") {
            $("#"+prefix+"-"+property).on('change keyup', function(event,skipValidation) {
                if (!skipValidation) {
                    validateNodeEditor(node,prefix);
                }
            });
        } else {
            $("#"+prefix+"-"+property).on("change", function(event,skipValidation) {
                if (!skipValidation) {
                    validateNodeEditor(node,prefix);
                }
            });
        }
    }

    /**
     * Assign the value to each credential field
     * @param node
     * @param credDef
     * @param credData
     * @param prefix
     */
    function populateCredentialsInputs(node, credDef, credData, prefix) {
        var cred;
        for (cred in credDef) {
            if (credDef.hasOwnProperty(cred)) {
                if (credDef[cred].type == 'password') {
                    if (credData[cred]) {
                        $('#' + prefix + '-' + cred).val(credData[cred]);
                    } else if (credData['has_' + cred]) {
                        $('#' + prefix + '-' + cred).val('__PWRD__');
                    }
                    else {
                        $('#' + prefix + '-' + cred).val('');
                    }
                } else {
                    preparePropertyEditor(credData, cred, prefix, credDef);
                }
                attachPropertyChangeHandler(node, credDef, cred, prefix);
            }
        }
    }

    /**
     * Update the node credentials from the edit form
     * @param node - the node containing the credentials
     * @param credDefinition - definition of the credentials
     * @param prefix - prefix of the input fields
     * @return {boolean} whether anything has changed
     */
    function updateNodeCredentials(node, credDefinition, prefix) {
        var changed = false;
        if(!node.credentials) {
            node.credentials = {_:{}};
        }

        for (var cred in credDefinition) {
            if (credDefinition.hasOwnProperty(cred)) {
                var input = $("#" + prefix + '-' + cred);
                var value = input.val();
                if (credDefinition[cred].type == 'password') {
                    node.credentials['has_' + cred] = (value !== "");
                    if (value == '__PWRD__') {
                        continue;
                    }
                    changed = true;

                }
                node.credentials[cred] = value;
                if (value != node.credentials._[cred]) {
                    changed = true;
                }
            }
        }
        return changed;
    }

    /**
     * Prepare all of the editor dialog fields
     * @param node - the node being edited
     * @param definition - the node definition
     * @param prefix - the prefix to use in the input element ids (node-input|node-config-input)
     */
    function prepareEditDialog(node,definition,prefix,done) {
        for (var d in definition.defaults) {
            if (definition.defaults.hasOwnProperty(d)) {
                if (definition.defaults[d].type) {
                    var configTypeDef = RED.nodes.getType(definition.defaults[d].type);
                    if (configTypeDef) {
                        if (configTypeDef.exclusive) {
                            prepareConfigNodeButton(node,d,definition.defaults[d].type,prefix);
                        } else {
                            prepareConfigNodeSelect(node,d,definition.defaults[d].type,prefix);
                        }
                    } else {
                        console.log("Unknown type:", definition.defaults[d].type);
                        preparePropertyEditor(node,d,prefix,definition.defaults);
                    }
                } else {
                    preparePropertyEditor(node,d,prefix,definition.defaults);
                }
                attachPropertyChangeHandler(node,definition.defaults,d,prefix);
            }
        }
        var completePrepare = function() {
            if (definition.oneditprepare) {
                try {
                    definition.oneditprepare.call(node);
                } catch(err) {
                    console.log("oneditprepare",node.id,node.type,err.toString());
                }
            }
            // Now invoke any change handlers added to the fields - passing true
            // to prevent full node validation from being triggered each time
            for (var d in definition.defaults) {
                if (definition.defaults.hasOwnProperty(d)) {
                    $("#"+prefix+"-"+d).trigger("change",[true]);
                }
            }
            if (definition.credentials) {
                for (d in definition.credentials) {
                    if (definition.credentials.hasOwnProperty(d)) {
                        $("#"+prefix+"-"+d).trigger("change",[true]);
                    }
                }
            }
            validateNodeEditor(node,prefix);
            if (done) {
                done();
            }
        }
        if (definition.credentials || /^subflow:/.test(definition.type)) {
            if (node.credentials) {
                populateCredentialsInputs(node, definition.credentials, node.credentials, prefix);
                completePrepare();
            } else {
                $.getJSON(getCredentialsURL(node.type, node.id), function (data) {
                    node.credentials = data;
                    node.credentials._ = $.extend(true,{},data);
                    if (!/^subflow:/.test(definition.type)) {
                        populateCredentialsInputs(node, definition.credentials, node.credentials, prefix);
                    }
                    completePrepare();
                });
            }
        } else {
            completePrepare();
        }
    }

    function getEditStackTitle() {
        var label;
        for (var i=editStack.length-1;i<editStack.length;i++) {
            var node = editStack[i];
            label = node.type;
            if (node.type === 'group') {
                label = RED._("group.editGroup",{name:RED.utils.sanitize(node.name||node.id)});
            } else if (node.type === '_expression') {
                label = RED._("expressionEditor.title");
            } else if (node.type === '_js') {
                label = RED._("jsEditor.title");
            } else if (node.type === '_text') {
                label = RED._("textEditor.title");
            } else if (node.type === '_json') {
                label = RED._("jsonEditor.title");
            } else if (node.type === '_markdown') {
                label = RED._("markdownEditor.title");
            } else if (node.type === '_buffer') {
                label = RED._("bufferEditor.title");
            } else if (node.type === 'subflow') {
                label = RED._("subflow.editSubflow",{name:RED.utils.sanitize(node.name)})
            } else if (node.type.indexOf("subflow:")===0) {
                var subflow = RED.nodes.subflow(node.type.substring(8));
                label = RED._("subflow.editSubflowInstance",{name:RED.utils.sanitize(subflow.name)})
            } else if (node._def !== undefined) {
                if (typeof node._def.paletteLabel !== "undefined") {
                    try {
                        label = RED.utils.sanitize((typeof node._def.paletteLabel === "function" ? node._def.paletteLabel.call(node._def) : node._def.paletteLabel)||"");
                    } catch(err) {
                        console.log("Definition error: "+node.type+".paletteLabel",err);
                    }
                }
                if (i === editStack.length-1) {
                    if (RED.nodes.node(node.id)) {
                        label = RED._("editor.editNode",{type:RED.utils.sanitize(label)});
                    } else {
                        label = RED._("editor.addNewConfig",{type:RED.utils.sanitize(label)});
                    }
                }
            }
        }
        return label;
    }

    function isSameObj(env0, env1) {
        return (JSON.stringify(env0) === JSON.stringify(env1));
    }

    function buildEditForm(container,formId,type,ns,node) {
        var dialogForm = $('<form id="'+formId+'" class="form-horizontal" autocomplete="off"></form>').appendTo(container);
        dialogForm.html($("script[data-template-name='"+type+"']").html());
        ns = ns||"node-red";
        dialogForm.find('[data-i18n]').each(function() {
            var current = $(this).attr("data-i18n");
            var keys = current.split(";");
            for (var i=0;i<keys.length;i++) {
                var key = keys[i];
                if (key.indexOf(":") === -1) {
                    var prefix = "";
                    if (key.indexOf("[")===0) {
                        var parts = key.split("]");
                        prefix = parts[0]+"]";
                        key = parts[1];
                    }
                    keys[i] = prefix+ns+":"+key;
                }
            }
            $(this).attr("data-i18n",keys.join(";"));
        });

        if (type === "subflow-template") {
            // This is the 'edit properties' dialog for a subflow template
            // TODO: this needs to happen later in the dialog open sequence
            //       so that credentials can be loaded prior to building the form
            RED.subflow.buildEditForm(type,node);
        }

        // Add dummy fields to prevent 'Enter' submitting the form in some
        // cases, and also prevent browser auto-fill of password
        //  - the elements cannot be hidden otherwise Chrome will ignore them.
        //  - the elements need to have id's that imply password/username
        $('<span style="position: absolute; top: -2000px;"><input id="red-ui-trap-password" type="password"/></span>').prependTo(dialogForm);
        $('<span style="position: absolute; top: -2000px;"><input id="red-ui-trap-username"  type="text"/></span>').prependTo(dialogForm);
        $('<span style="position: absolute; top: -2000px;"><input id="red-ui-trap-user"  type="text"/></span>').prependTo(dialogForm);
        dialogForm.on("submit", function(e) { e.preventDefault();});
        dialogForm.find('input').attr("autocomplete","off");
        return dialogForm;
    }

    function refreshLabelForm(container,node) {

        var inputPlaceholder = node._def.inputLabels?RED._("editor.defaultLabel"):RED._("editor.noDefaultLabel");
        var outputPlaceholder = node._def.outputLabels?RED._("editor.defaultLabel"):RED._("editor.noDefaultLabel");

        var inputsDiv = $("#red-ui-editor-node-label-form-inputs");
        var outputsDiv = $("#red-ui-editor-node-label-form-outputs");

        var inputCount;
        var formInputs = $("#node-input-inputs").val();
        if (formInputs === undefined) {
            if (node.type === 'subflow') {
                inputCount = node.in.length;
            } else {
                inputCount = node.inputs || node._def.inputs || 0;
            }
        } else {
            inputCount = Math.min(1,Math.max(0,parseInt(formInputs)));
            if (isNaN(inputCount)) {
                inputCount = 0;
            }
        }

        var children = inputsDiv.children();
        var childCount = children.length;
        if (childCount === 1 && $(children[0]).hasClass('red-ui-editor-node-label-form-none')) {
            childCount--;
        }

        if (childCount < inputCount) {
            if (childCount === 0) {
                // remove the 'none' placeholder
                $(children[0]).remove();
            }
            for (i = childCount;i<inputCount;i++) {
                buildLabelRow("input",i,"",inputPlaceholder).appendTo(inputsDiv);
            }
        } else if (childCount > inputCount) {
            for (i=inputCount;i<childCount;i++) {
                $(children[i]).remove();
            }
            if (inputCount === 0) {
                buildLabelRow().appendTo(inputsDiv);
            }
        }

        var outputCount;
        var i;
        var formOutputs = $("#node-input-outputs").val();

        if (formOutputs === undefined) {
            if (node.type === 'subflow') {
                outputCount = node.out.length;
            } else {
                inputCount = node.outputs || node._def.outputs || 0;
            }
        } else if (isNaN(formOutputs)) {
            var outputMap = JSON.parse(formOutputs);
            var keys = Object.keys(outputMap);
            children = outputsDiv.children();
            childCount = children.length;
            if (childCount === 1 && $(children[0]).hasClass('red-ui-editor-node-label-form-none')) {
                childCount--;
            }

            outputCount = 0;
            var rows = [];
            keys.forEach(function(p) {
                var row = $("#red-ui-editor-node-label-form-output-"+p).parent();
                if (row.length === 0 && outputMap[p] !== -1) {
                    if (childCount === 0) {
                        $(children[0]).remove();
                        childCount = -1;
                    }
                    row = buildLabelRow("output",p,"",outputPlaceholder);
                } else {
                    row.detach();
                }
                if (outputMap[p] !== -1) {
                    outputCount++;
                    rows.push({i:parseInt(outputMap[p]),r:row});
                }
            });
            rows.sort(function(A,B) {
                return A.i-B.i;
            })
            rows.forEach(function(r,i) {
                r.r.find("label").text((i+1)+".");
                r.r.appendTo(outputsDiv);
            })
            if (rows.length === 0) {
                buildLabelRow("output",i,"").appendTo(outputsDiv);
            } else {

            }
        } else {
            outputCount = Math.max(0,parseInt(formOutputs));
        }
        children = outputsDiv.children();
        childCount = children.length;
        if (childCount === 1 && $(children[0]).hasClass('red-ui-editor-node-label-form-none')) {
            childCount--;
        }
        if (childCount < outputCount) {
            if (childCount === 0) {
                // remove the 'none' placeholder
                $(children[0]).remove();
            }
            for (i = childCount;i<outputCount;i++) {
                buildLabelRow("output",i,"").appendTo(outputsDiv);
            }
        } else if (childCount > outputCount) {
            for (i=outputCount;i<childCount;i++) {
                $(children[i]).remove();
            }
            if (outputCount === 0) {
                buildLabelRow().appendTo(outputsDiv);
            }
        }
    }
    function buildLabelRow(type, index, value, placeHolder) {
        var result = $('<div>',{class:"red-ui-editor-node-label-form-row"});
        if (type === undefined) {
            $('<span>').text(RED._("editor.noDefaultLabel")).appendTo(result);
            result.addClass("red-ui-editor-node-label-form-none");
        } else {
            result.addClass("");
            var id = "red-ui-editor-node-label-form-"+type+"-"+index;
            $('<label>',{for:id}).text((index+1)+".").appendTo(result);
            var input = $('<input>',{type:"text",id:id, placeholder: placeHolder}).val(value).appendTo(result);
            var clear = $('<button type="button" class="red-ui-button red-ui-button-small"><i class="fa fa-times"></i></button>').appendTo(result);
            clear.on("click", function(evt) {
                evt.preventDefault();
                input.val("");
            })
        }
        return result;
    }
    function showIconPicker(container, backgroundColor, iconPath, faOnly, done) {
        var picker = $('<div class="red-ui-icon-picker">');
        var searchDiv = $("<div>",{class:"red-ui-search-container"}).appendTo(picker);
        searchInput = $('<input type="text">').attr("placeholder",RED._("editor.searchIcons")).appendTo(searchDiv).searchBox({
            delay: 50,
            change: function() {
                var searchTerm = $(this).val().trim();
                if (searchTerm === "") {
                    iconList.find(".red-ui-icon-list-module").show();
                    iconList.find(".red-ui-icon-list-icon").show();
                } else {
                    iconList.find(".red-ui-icon-list-module").hide();
                    iconList.find(".red-ui-icon-list-icon").each(function(i,n) {
                        if ($(n).data('icon').indexOf(searchTerm) === -1) {
                            $(n).hide();
                        } else {
                            $(n).show();
                        }
                    });
                }
            }
        });

        var row = $('<div>').appendTo(picker);
        var iconList = $('<div class="red-ui-icon-list">').appendTo(picker);
        var metaRow = $('<div class="red-ui-icon-meta"></div>').appendTo(picker);
        var summary = $('<span>').appendTo(metaRow);
        var resetButton = $('<button type="button" class="red-ui-button red-ui-button-small">'+RED._("editor.useDefault")+'</button>').appendTo(metaRow).on("click", function(e) {
            e.preventDefault();
            iconPanel.hide();
            done(null);
        });
        if (!backgroundColor && faOnly) {
            iconList.addClass("red-ui-icon-list-dark");
        }
        setTimeout(function() {
            var iconSets = RED.nodes.getIconSets();
            Object.keys(iconSets).forEach(function(moduleName) {
                if (faOnly && (moduleName !== "font-awesome")) {
                    return;
                }
                var icons = iconSets[moduleName];
                if (icons.length > 0) {
                    // selectIconModule.append($("<option></option>").val(moduleName).text(moduleName));
                    var header = $('<div class="red-ui-icon-list-module"></div>').text(moduleName).appendTo(iconList);
                    $('<i class="fa fa-cube"></i>').prependTo(header);
                    icons.forEach(function(icon) {
                        var iconDiv = $('<div>',{class:"red-ui-icon-list-icon"}).appendTo(iconList);
                        var nodeDiv = $('<div>',{class:"red-ui-search-result-node"}).appendTo(iconDiv);
                        var icon_url = RED.settings.apiRootUrl+"icons/"+moduleName+"/"+icon;
                        iconDiv.data('icon',icon_url);
                        if (backgroundColor) {
                            nodeDiv.css({
                                'backgroundColor': backgroundColor
                            });
                            var borderColor = RED.utils.getDarkerColor(backgroundColor);
                            if (borderColor !== backgroundColor) {
                                nodeDiv.css('border-color',borderColor)
                            }

                        }
                        var iconContainer = $('<div/>',{class:"red-ui-palette-icon-container"}).appendTo(nodeDiv);
                        RED.utils.createIconElement(icon_url, iconContainer, true);

                        if (iconPath.module === moduleName && iconPath.file === icon) {
                            iconDiv.addClass("selected");
                        }
                        iconDiv.on("mouseover", function() {
                            summary.text(icon);
                        })
                        iconDiv.on("mouseout", function() {
                            summary.html("&nbsp;");
                        })
                        iconDiv.on("click", function() {
                            iconPanel.hide();
                            done(moduleName+"/"+icon);
                        })
                    })
                }
            });
            setTimeout(function() {
                spinner.remove();
            },50);
        },300);
        var spinner = RED.utils.addSpinnerOverlay(iconList,true);
        var iconPanel = RED.popover.panel(picker);
        iconPanel.show({
            target: container
        })


        picker.slideDown(100);
        searchInput.trigger("focus");
    }

    function buildAppearanceForm(container,node) {
        var dialogForm = $('<form class="dialog-form form-horizontal" autocomplete="off"></form>').appendTo(container);

        var i,row;

        if (node.type === "subflow") {
            var categoryRow = $("<div/>", {
                class: "form-row"
            }).appendTo(dialogForm);
            $("<label/>", {
                for: "subflow-appearance-input-category",
                "data-i18n": "editor:subflow.category"
            }).appendTo(categoryRow);
            var categorySelector = $("<select/>", {
                id: "subflow-appearance-input-category"
            }).css({
                width: "250px"
            }).appendTo(categoryRow);
            $("<input/>", {
                type: "text",
                id: "subflow-appearance-input-custom-category"
            }).css({
                display: "none",
                "margin-left": "10px",
                width: "calc(100% - 250px)"
            }).appendTo(categoryRow);

            var categories = RED.palette.getCategories();
            categories.sort(function(A,B) {
                return A.label.localeCompare(B.label);
            })
            categories.forEach(function(cat) {
                categorySelector.append($("<option/>").val(cat.id).text(cat.label));
            })
            categorySelector.append($("<option/>").attr('disabled',true).text("---"));
            categorySelector.append($("<option/>").val("_custom_").text(RED._("palette.addCategory")));

            $("#subflow-appearance-input-category").on("change", function() {
                var val = $(this).val();
                if (val === "_custom_") {
                    $("#subflow-appearance-input-category").width(120);
                    $("#subflow-appearance-input-custom-category").show();
                } else {
                    $("#subflow-appearance-input-category").width(250);
                    $("#subflow-appearance-input-custom-category").hide();
                }
            })

            $("#subflow-appearance-input-category").val(node.category||"subflows");
            var userCount = 0;
            var subflowType = "subflow:"+node.id;

            // RED.nodes.eachNode(function(n) {
            //     if (n.type === subflowType) {
            //         userCount++;
            //     }
            // });
            $("#red-ui-editor-subflow-user-count")
                .text(RED._("subflow.subflowInstances", {count:node.instances.length})).show();
        }

        $('<div class="form-row">'+
            '<label for="node-input-show-label-btn" data-i18n="editor.label"></label>'+
            '<span style="margin-right: 2px;"/>'+
            '<input type="checkbox" id="node-input-show-label"/>'+
        '</div>').appendTo(dialogForm);

        $("#node-input-show-label").toggleButton({
            enabledLabel: RED._("editor.show"),
            disabledLabel: RED._("editor.hide")
        })

        if (!node.hasOwnProperty("l")) {
            // Show label if type not link
            node.l = !/^link (in|out)$/.test(node._def.type);
        }
        $("#node-input-show-label").prop("checked",node.l).trigger("change");

        if (node.type === "subflow") {
            // subflow template can select its color
            var color = node.color ? node.color : "#DDAA99";
            var colorRow = $("<div/>", {
                class: "form-row"
            }).appendTo(dialogForm);
            $("<label/>").text(RED._("editor.color")).appendTo(colorRow);

            var recommendedColors = [
                "#DDAA99",
                "#3FADB5", "#87A980", "#A6BBCF",
                "#AAAA66", "#C0C0C0", "#C0DEED",
                "#C7E9C0", "#D7D7A0", "#D8BFD8",
                "#DAC4B4", "#DEB887", "#DEBD5C",
                "#E2D96E", "#E6E0F8", "#E7E7AE",
                "#E9967A", "#F3B567", "#FDD0A2",
                "#FDF0C2", "#FFAAAA", "#FFCC66",
                "#FFF0F0", "#FFFFFF"
            ]

            RED.colorPicker.create({
                id: "red-ui-editor-node-color",
                value: color,
                palette: recommendedColors,
                sortPalette: function (a, b) {return a.l - b.l;}
            }).appendTo(colorRow);

            $("#red-ui-editor-node-color").on('change', function(ev) {
                // Horribly out of scope...
                var colour = $(this).val();
                nodeDiv.css('backgroundColor',colour);
                var borderColor = RED.utils.getDarkerColor(colour);
                if (borderColor !== colour) {
                    nodeDiv.css('border-color',borderColor)
                }
            })
        }


        // If a node has icon property in defaults, the icon of the node cannot be modified. (e.g, ui_button node in dashboard)
        if ((!node._def.defaults || !node._def.defaults.hasOwnProperty("icon"))) {
            var iconRow = $('<div class="form-row"></div>').appendTo(dialogForm);
            $('<label data-i18n="editor.settingIcon">').appendTo(iconRow);

            var iconButton = $('<button type="button" class="red-ui-button red-ui-editor-node-appearance-button">').appendTo(iconRow);
            $('<i class="fa fa-caret-down"></i>').appendTo(iconButton);
            var nodeDiv = $('<div>',{class:"red-ui-search-result-node"}).appendTo(iconButton);
            var colour = RED.utils.getNodeColor(node.type, node._def);
            var icon_url = RED.utils.getNodeIcon(node._def,node);
            nodeDiv.css('backgroundColor',colour);
            var borderColor = RED.utils.getDarkerColor(colour);
            if (borderColor !== colour) {
                nodeDiv.css('border-color',borderColor)
            }

            var iconContainer = $('<div/>',{class:"red-ui-palette-icon-container"}).appendTo(nodeDiv);
            RED.utils.createIconElement(icon_url, iconContainer, true);

            iconButton.on("click", function(e) {
                e.preventDefault();
                var iconPath;
                var icon = $("#red-ui-editor-node-icon").val()||"";
                if (icon) {
                    iconPath = RED.utils.separateIconPath(icon);
                } else {
                    iconPath = RED.utils.getDefaultNodeIcon(node._def, node);
                }
                var backgroundColor = RED.utils.getNodeColor(node.type, node._def);
                if (node.type === "subflow") {
                    backgroundColor = $("#red-ui-editor-node-color").val();
                }
                showIconPicker(iconButton,backgroundColor,iconPath,false,function(newIcon) {
                    $("#red-ui-editor-node-icon").val(newIcon||"");
                    var icon_url = RED.utils.getNodeIcon(node._def,{type:node.type,icon:newIcon});
                    RED.utils.createIconElement(icon_url, iconContainer, true);
                });
            });

            RED.popover.tooltip(iconButton, function() {
                return $("#red-ui-editor-node-icon").val() || RED._("editor.default");
            })
            $('<input type="hidden" id="red-ui-editor-node-icon">').val(node.icon).appendTo(iconRow);
        }


        $('<div class="form-row"><span data-i18n="editor.portLabels"></span></div>').appendTo(dialogForm);

        var inputCount = node.inputs || node._def.inputs || 0;
        var outputCount = node.outputs || node._def.outputs || 0;
        if (node.type === 'subflow') {
            inputCount = node.in.length;
            outputCount = node.out.length;
        }

        var inputLabels = node.inputLabels || [];
        var outputLabels = node.outputLabels || [];

        var inputPlaceholder = node._def.inputLabels?RED._("editor.defaultLabel"):RED._("editor.noDefaultLabel");
        var outputPlaceholder = node._def.outputLabels?RED._("editor.defaultLabel"):RED._("editor.noDefaultLabel");

        $('<div class="form-row"><span style="margin-left: 50px;" data-i18n="editor.labelInputs"></span><div id="red-ui-editor-node-label-form-inputs"></div></div>').appendTo(dialogForm);
        var inputsDiv = $("#red-ui-editor-node-label-form-inputs");
        if (inputCount > 0) {
            for (i=0;i<inputCount;i++) {
                buildLabelRow("input",i,inputLabels[i],inputPlaceholder).appendTo(inputsDiv);
            }
        } else {
            buildLabelRow().appendTo(inputsDiv);
        }
        $('<div class="form-row"><span style="margin-left: 50px;" data-i18n="editor.labelOutputs"></span><div id="red-ui-editor-node-label-form-outputs"></div></div>').appendTo(dialogForm);
        var outputsDiv = $("#red-ui-editor-node-label-form-outputs");
        if (outputCount > 0) {
            for (i=0;i<outputCount;i++) {
                buildLabelRow("output",i,outputLabels[i],outputPlaceholder).appendTo(outputsDiv);
            }
        } else {
            buildLabelRow().appendTo(outputsDiv);
        }
    }


    function updateLabels(editing_node, changes, outputMap) {
        var inputLabels = $("#red-ui-editor-node-label-form-inputs").children().find("input");
        var outputLabels = $("#red-ui-editor-node-label-form-outputs").children().find("input");

        var hasNonBlankLabel = false;
        var changed = false;
        var newValue = inputLabels.map(function() {
            var v = $(this).val();
            hasNonBlankLabel = hasNonBlankLabel || v!== "";
            return v;
        }).toArray().slice(0,editing_node.inputs);
        if ((editing_node.inputLabels === undefined && hasNonBlankLabel) ||
            (editing_node.inputLabels !== undefined && JSON.stringify(newValue) !== JSON.stringify(editing_node.inputLabels))) {
            changes.inputLabels = editing_node.inputLabels;
            editing_node.inputLabels = newValue;
            changed = true;
        }
        hasNonBlankLabel = false;
        newValue = new Array(editing_node.outputs);
        outputLabels.each(function() {
            var index = $(this).attr('id').substring("red-ui-editor-node-label-form-output-".length);
            if (outputMap && outputMap.hasOwnProperty(index)) {
                index = parseInt(outputMap[index]);
                if (index === -1) {
                    return;
                }
            }
            var v = $(this).val();
            hasNonBlankLabel = hasNonBlankLabel || v!== "";
            newValue[index] = v;
        });

        if ((editing_node.outputLabels === undefined && hasNonBlankLabel) ||
            (editing_node.outputLabels !== undefined && JSON.stringify(newValue) !== JSON.stringify(editing_node.outputLabels))) {
            changes.outputLabels = editing_node.outputLabels;
            editing_node.outputLabels = newValue;
            changed = true;
        }
        return changed;
    }

    function buildDescriptionForm(container,node) {
        var dialogForm = $('<form class="dialog-form form-horizontal" autocomplete="off"></form>').appendTo(container);
        var toolbarRow = $('<div></div>').appendTo(dialogForm);
        var row = $('<div class="form-row node-text-editor-row" style="position:relative; padding-top: 4px; height: 100%"></div>').appendTo(dialogForm);
        $('<div style="height: 100%" class="node-text-editor" id="node-info-input-info-editor" ></div>').appendTo(row);
        var nodeInfoEditor = RED.editor.createEditor({
            id: "node-info-input-info-editor",
            mode: 'ace/mode/markdown',
            value: ""
        });
        if (node.info) {
            nodeInfoEditor.getSession().setValue(node.info, -1);
        }
        node.infoEditor = nodeInfoEditor;
        return nodeInfoEditor;
    }

    function showEditDialog(node, defaultTab) {
        var editing_node = node;
        var isDefaultIcon;
        var defaultIcon;
        var nodeInfoEditor;
        var finishedBuilding = false;
        var skipInfoRefreshOnClose = false;

        editStack.push(node);
        RED.view.state(RED.state.EDITING);
        var type = node.type;
        if (node.type.substring(0,8) == "subflow:") {
            type = "subflow";
        }
        var trayOptions = {
            title: getEditStackTitle(),
            buttons: [
                {
                    id: "node-dialog-delete",
                    class: 'leftButton',
                    text: RED._("common.label.delete"),
                    click: function() {
                        var startDirty = RED.nodes.dirty();
                        var removedNodes = [];
                        var removedLinks = [];
                        var removedEntities = RED.nodes.remove(editing_node.id);
                        removedNodes.push(editing_node);
                        removedNodes = removedNodes.concat(removedEntities.nodes);
                        removedLinks = removedLinks.concat(removedEntities.links);

                        var historyEvent = {
                            t:'delete',
                            nodes:removedNodes,
                            links:removedLinks,
                            changes: {},
                            dirty: startDirty
                        }

                        RED.nodes.dirty(true);
                        RED.view.redraw(true);
                        RED.history.push(historyEvent);
                        RED.tray.close();
                    }
                },
                {
                    id: "node-dialog-cancel",
                    text: RED._("common.label.cancel"),
                    click: function() {
                        if (editing_node._def) {
                            if (editing_node._def.oneditcancel) {
                                try {
                                    editing_node._def.oneditcancel.call(editing_node);
                                } catch(err) {
                                    console.log("oneditcancel",editing_node.id,editing_node.type,err.toString());
                                }
                            }

                            for (var d in editing_node._def.defaults) {
                                if (editing_node._def.defaults.hasOwnProperty(d)) {
                                    var def = editing_node._def.defaults[d];
                                    if (def.type) {
                                        var configTypeDef = RED.nodes.getType(def.type);
                                        if (configTypeDef && configTypeDef.exclusive) {
                                            var input = $("#node-input-"+d).val()||"";
                                            if (input !== "" && !editing_node[d]) {
                                                // This node has an exclusive config node that
                                                // has just been added. As the user is cancelling
                                                // the edit, need to delete the just-added config
                                                // node so that it doesn't get orphaned.
                                                RED.nodes.remove(input);
                                            }
                                        }
                                    }
                                }

                            }
                        }
                        RED.tray.close();
                    }
                },
                {
                    id: "node-dialog-ok",
                    text: RED._("common.label.done"),
                    class: "primary",
                    click: function() {
                        var changes = {};
                        var changed = false;
                        var wasDirty = RED.nodes.dirty();
                        var d;
                        var outputMap;

                        if (editing_node._def.oneditsave) {
                            var oldValues = {};
                            for (d in editing_node._def.defaults) {
                                if (editing_node._def.defaults.hasOwnProperty(d)) {
                                    if (typeof editing_node[d] === "string" || typeof editing_node[d] === "number") {
                                        oldValues[d] = editing_node[d];
                                    } else {
                                        oldValues[d] = $.extend(true,{},{v:editing_node[d]}).v;
                                    }
                                }
                            }
                            try {
                                var rc = editing_node._def.oneditsave.call(editing_node);
                                if (rc === true) {
                                    changed = true;
                                }
                            } catch(err) {
                                console.log("oneditsave",editing_node.id,editing_node.type,err.toString());
                            }

                            for (d in editing_node._def.defaults) {
                                if (editing_node._def.defaults.hasOwnProperty(d)) {
                                    if (oldValues[d] === null || typeof oldValues[d] === "string" || typeof oldValues[d] === "number") {
                                        if (oldValues[d] !== editing_node[d]) {
                                            changes[d] = oldValues[d];
                                            changed = true;
                                        }
                                    } else {
                                        if (JSON.stringify(oldValues[d]) !== JSON.stringify(editing_node[d])) {
                                            changes[d] = oldValues[d];
                                            changed = true;
                                        }
                                    }
                                }
                            }
                        }

                        var newValue;
                        if (editing_node._def.defaults) {
                            for (d in editing_node._def.defaults) {
                                if (editing_node._def.defaults.hasOwnProperty(d)) {
                                    var input = $("#node-input-"+d);
                                    if (input.attr('type') === "checkbox") {
                                        newValue = input.prop('checked');
                                    } else if (input.prop("nodeName") === "select" && input.attr("multiple") === "multiple") {
                                        // An empty select-multiple box returns null.
                                        // Need to treat that as an empty array.
                                        newValue = input.val();
                                        if (newValue == null) {
                                            newValue = [];
                                        }
                                    } else if ("format" in editing_node._def.defaults[d] && editing_node._def.defaults[d].format !== "" && input[0].nodeName === "DIV") {
                                        newValue = input.text();
                                    } else {
                                        newValue = input.val();
                                    }
                                    if (newValue != null) {
                                        if (d === "outputs") {
                                            if  (newValue.trim() === "") {
                                                continue;
                                            }
                                            if (isNaN(newValue)) {
                                                outputMap = JSON.parse(newValue);
                                                var outputCount = 0;
                                                var outputsChanged = false;
                                                var keys = Object.keys(outputMap);
                                                keys.forEach(function(p) {
                                                    if (isNaN(p)) {
                                                        // New output;
                                                        outputCount ++;
                                                        delete outputMap[p];
                                                    } else {
                                                        outputMap[p] = outputMap[p]+"";
                                                        if (outputMap[p] !== "-1") {
                                                            outputCount++;
                                                            if (outputMap[p] !== p) {
                                                                // Output moved
                                                                outputsChanged = true;
                                                            } else {
                                                                delete outputMap[p];
                                                            }
                                                        } else {
                                                            // Output removed
                                                            outputsChanged = true;
                                                        }
                                                    }
                                                });

                                                newValue = outputCount;
                                                if (outputsChanged) {
                                                    changed = true;
                                                }
                                            } else {
                                                newValue = parseInt(newValue);
                                            }
                                        }
                                        if (editing_node._def.defaults[d].type) {
                                            if (newValue == "_ADD_") {
                                                newValue = "";
                                            }
                                        }
                                        if (editing_node[d] != newValue) {
                                            if (editing_node._def.defaults[d].type) {
                                                // Change to a related config node
                                                var configNode = RED.nodes.node(editing_node[d]);
                                                if (configNode) {
                                                    var users = configNode.users;
                                                    users.splice(users.indexOf(editing_node),1);
                                                    RED.events.emit("nodes:change",configNode);
                                                }
                                                configNode = RED.nodes.node(newValue);
                                                if (configNode) {
                                                    configNode.users.push(editing_node);
                                                    RED.events.emit("nodes:change",configNode);
                                                }
                                            }
                                            changes[d] = editing_node[d];
                                            editing_node[d] = newValue;
                                            changed = true;
                                        }
                                    }
                                }
                            }
                        }
                        if (editing_node._def.credentials) {
                            var prefix = 'node-input';
                            var credDefinition = editing_node._def.credentials;
                            var credsChanged = updateNodeCredentials(editing_node,credDefinition,prefix);
                            changed = changed || credsChanged;
                        }
                        // if (editing_node.hasOwnProperty("_outputs")) {
                        //     outputMap = editing_node._outputs;
                        //     delete editing_node._outputs;
                        //     if (Object.keys(outputMap).length > 0) {
                        //         changed = true;
                        //     }
                        // }
                        var removedLinks = updateNodeProperties(editing_node,outputMap);

                        if (updateLabels(editing_node, changes, outputMap)) {
                            changed = true;
                        }

                        if (!editing_node._def.defaults || !editing_node._def.defaults.hasOwnProperty("icon")) {
                            var icon = $("#red-ui-editor-node-icon").val()||""
                            if (!isDefaultIcon) {
                                if (icon !== editing_node.icon) {
                                    changes.icon = editing_node.icon;
                                    editing_node.icon = icon;
                                    changed = true;
                                }
                            } else {
                                if (icon !== "" && icon !== defaultIcon) {
                                    changes.icon = editing_node.icon;
                                    editing_node.icon = icon;
                                    changed = true;
                                } else {
                                    var iconPath = RED.utils.getDefaultNodeIcon(editing_node._def, editing_node);
                                    var currentDefaultIcon = iconPath.module+"/"+iconPath.file;
                                    if (defaultIcon !== currentDefaultIcon) {
                                        changes.icon = editing_node.icon;
                                        editing_node.icon = currentDefaultIcon;
                                        changed = true;
                                    }
                                }
                            }
                        }

                        if (!$("#node-input-show-label").prop('checked')) {
                            // Not checked - hide label
                            if (!/^link (in|out)$/.test(node.type)) {
                                // Not a link node - default state is true
                                if (node.l !== false) {
                                    changes.l = node.l
                                    changed = true;
                                }
                                node.l = false;
                            } else {
                                // A link node - default state is false
                                if (node.hasOwnProperty('l') && node.l) {
                                    changes.l = node.l
                                    changed = true;
                                }
                                delete node.l;
                            }
                        } else {
                            // Checked - show label
                            if (!/^link (in|out)$/.test(node.type)) {
                                // Not a link node - default state is true
                                if (node.hasOwnProperty('l') && !node.l) {
                                    changes.l = node.l
                                    changed = true;
                                }
                                delete node.l;
                            } else {
                                if (!node.l) {
                                    changes.l = node.l
                                    changed = true;
                                }
                                node.l = true;
                            }
                        }
                        if ($("#node-input-node-disabled").prop('checked')) {
                            if (node.d !== true) {
                                changes.d = node.d;
                                changed = true;
                                node.d = true;
                            }
                        } else {
                            if (node.d === true) {
                                changes.d = node.d;
                                changed = true;
                                delete node.d;
                            }
                        }

                        node.resize = true;

                        var oldInfo = node.info;
                        if (nodeInfoEditor) {
                            var newInfo = nodeInfoEditor.getValue();
                            if (!!oldInfo) {
                                // Has existing info property
                                if (newInfo.trim() === "") {
                                    // New value is blank - remove the property
                                    changed = true;
                                    changes.info = oldInfo;
                                    delete node.info;
                                } else if (newInfo !== oldInfo) {
                                    // New value is different
                                    changed = true;
                                    changes.info = oldInfo;
                                    node.info = newInfo;
                                }
                            } else {
                                // No existing info
                                if (newInfo.trim() !== "") {
                                    // New value is not blank
                                    changed = true;
                                    changes.info = undefined;
                                    node.info = newInfo;
                                }
                            }
                        }

                        if (type === "subflow") {
                            var old_env = editing_node.env;
                            var new_env = RED.subflow.exportSubflowInstanceEnv(editing_node);
                            if (new_env && new_env.length > 0) {
                                new_env.forEach(function(prop) {
                                    if (prop.type === "cred") {
                                        editing_node.credentials = editing_node.credentials || {_:{}};
                                        editing_node.credentials[prop.name] = prop.value;
                                        editing_node.credentials['has_'+prop.name] = (prop.value !== "");
                                        if (prop.value !== '__PWRD__') {
                                            changed = true;
                                        }
                                        delete prop.value;
                                    }
                                });
                            }
                            if (!isSameObj(old_env, new_env)) {
                                editing_node.env = new_env;
                                changes.env = editing_node.env;
                                changed = true;
                            }
                         }

                        if (changed) {
                            var wasChanged = editing_node.changed;
                            editing_node.changed = true;
                            RED.nodes.dirty(true);

                            var activeSubflow = RED.nodes.subflow(RED.workspaces.active());
                            var subflowInstances = null;
                            if (activeSubflow) {
                                subflowInstances = [];
                                RED.nodes.eachNode(function(n) {
                                    if (n.type == "subflow:"+RED.workspaces.active()) {
                                        subflowInstances.push({
                                            id:n.id,
                                            changed:n.changed
                                        });
                                        n.changed = true;
                                        n.dirty = true;
                                        updateNodeProperties(n);
                                    }
                                });
                            }
                            var historyEvent = {
                                t:'edit',
                                node:editing_node,
                                changes:changes,
                                links:removedLinks,
                                dirty:wasDirty,
                                changed:wasChanged
                            };
                            if (outputMap) {
                                historyEvent.outputMap = outputMap;
                            }
                            if (subflowInstances) {
                                historyEvent.subflow = {
                                    instances:subflowInstances
                                }
                            }
                            RED.history.push(historyEvent);
                        }
                        editing_node.dirty = true;
                        validateNode(editing_node);
                        RED.events.emit("editor:save",editing_node);
                        RED.events.emit("nodes:change",editing_node);
                        RED.tray.close();
                    }
                }
            ],
            resize: function(dimensions) {
                editTrayWidthCache[type] = dimensions.width;
                $(".red-ui-tray-content").height(dimensions.height - 50);
                var form = $(".red-ui-tray-content form").height(dimensions.height - 50 - 40);
                if (editing_node && editing_node._def.oneditresize) {
                    try {
                        editing_node._def.oneditresize.call(editing_node,{width:form.width(),height:form.height()});
                    } catch(err) {
                        console.log("oneditresize",editing_node.id,editing_node.type,err.toString());
                    }
                }
            },
            open: function(tray, done) {
                if (editing_node.hasOwnProperty('outputs')) {
                    editing_node.__outputs = editing_node.outputs;
                }

                var trayFooter = tray.find(".red-ui-tray-footer");
                var trayBody = tray.find('.red-ui-tray-body');
                trayBody.parent().css('overflow','hidden');

                var trayFooterLeft = $('<div class="red-ui-tray-footer-left"></div>').appendTo(trayFooter)

                $('<input id="node-input-node-disabled" type="checkbox">').prop("checked",!!node.d).appendTo(trayFooterLeft).toggleButton({
                    enabledIcon: "fa-circle-thin",
                    disabledIcon: "fa-ban",
                    invertState: true
                })

                var editorTabEl = $('<ul></ul>').appendTo(trayBody);
                var editorContent = $('<div></div>').appendTo(trayBody);

                var editorTabs = RED.tabs.create({
                    element:editorTabEl,
                    onchange:function(tab) {
                        editorContent.children().hide();
                        if (tab.onchange) {
                            tab.onchange.call(tab);
                        }
                        tab.content.show();
                        if (finishedBuilding) {
                            RED.tray.resize();
                        }
                    },
                    collapsible: true,
                    menu: false
                });
                var ns;
                if (node._def.set.module === "node-red") {
                    ns = "node-red";
                } else {
                    ns = node._def.set.id;
                }
                var iconPath = RED.utils.getDefaultNodeIcon(node._def,node);
                defaultIcon = iconPath.module+"/"+iconPath.file;
                if (node.icon && node.icon !== defaultIcon) {
                    isDefaultIcon = false;
                } else {
                    isDefaultIcon = true;
                }

                var nodePropertiesTab = {
                    id: "editor-tab-properties",
                    label: RED._("editor-tab.properties"),
                    name: RED._("editor-tab.properties"),
                    content: $('<div>', {class:"red-ui-tray-content"}).appendTo(editorContent).hide(),
                    iconClass: "fa fa-cog"
                };
                buildEditForm(nodePropertiesTab.content,"dialog-form",type,ns,node);
                editorTabs.addTab(nodePropertiesTab);

                if (/^subflow:/.test(node.type)) {
                    var subflowPropertiesTab = {
                        id: "editor-subflow-envProperties",
                        label: RED._("editor-tab.envProperties"),
                        name: RED._("editor-tab.envProperties"),
                        content: $('<div>', {id:"editor-subflow-envProperties-content",class:"red-ui-tray-content"}).appendTo(editorContent).hide(),
                        iconClass: "fa fa-list"
                    };
                    editorTabs.addTab(subflowPropertiesTab);
                    // This tab is populated by the oneditprepare function of this
                    // subflow. That ensures it is done *after* any credentials
                    // have been loaded for the instance.
                }

                if (!node._def.defaults || !node._def.defaults.hasOwnProperty('info'))  {
                    var descriptionTab = {
                        id: "editor-tab-description",
                        label: RED._("editor-tab.description"),
                        name: RED._("editor-tab.description"),
                        content: $('<div>', {class:"red-ui-tray-content"}).appendTo(editorContent).hide(),
                        iconClass: "fa fa-file-text-o",
                        onchange: function() {
                            nodeInfoEditor.focus();
                        }
                    };
                    editorTabs.addTab(descriptionTab);
                    nodeInfoEditor = buildDescriptionForm(descriptionTab.content,node);
                }

                var appearanceTab = {
                    id: "editor-tab-appearance",
                    label: RED._("editor-tab.appearance"),
                    name: RED._("editor-tab.appearance"),
                    content: $('<div>', {class:"red-ui-tray-content"}).appendTo(editorContent).hide(),
                    iconClass: "fa fa-object-group",
                    onchange: function() {
                        refreshLabelForm(this.content,node);
                    }
                };
                buildAppearanceForm(appearanceTab.content,node);
                editorTabs.addTab(appearanceTab);

                prepareEditDialog(node,node._def,"node-input", function() {
                    trayBody.i18n();
                    finishedBuilding = true;
                    if (defaultTab) {
                        editorTabs.activateTab(defaultTab);
                    }
                    done();
                });
            },
            close: function() {
                if (RED.view.state() != RED.state.IMPORT_DRAGGING) {
                    RED.view.state(RED.state.DEFAULT);
                }
                if (editing_node && !skipInfoRefreshOnClose) {
                    RED.sidebar.info.refresh(editing_node);
                }
                RED.workspaces.refresh();
                if (nodeInfoEditor) {
                    nodeInfoEditor.destroy();
                    nodeInfoEditor = null;
                }
                RED.view.redraw(true);
                editStack.pop();
            },
            show: function() {
                if (editing_node) {
                    RED.sidebar.info.refresh(editing_node);
                    RED.sidebar.help.show(editing_node.type, false);
                }
            }
        }
        if (editTrayWidthCache.hasOwnProperty(type)) {
            trayOptions.width = editTrayWidthCache[type];
        }

        if (type === 'subflow') {
            var id = editing_node.type.substring(8);
            trayOptions.buttons.unshift({
                class: 'leftButton',
                text: RED._("subflow.edit"),
                click: function() {
                    RED.workspaces.show(id);
                    skipInfoRefreshOnClose = true;
                    $("#node-dialog-ok").trigger("click");
                }
            });
        }

        RED.tray.show(trayOptions);
    }
    /**
     * name - name of the property that holds this config node
     * type - type of config node
     * id - id of config node to edit. _ADD_ for a new one
     * prefix - the input prefix of the parent property
     */
    function showEditConfigNodeDialog(name,type,id,prefix) {
        var adding = (id == "_ADD_");
        var node_def = RED.nodes.getType(type);
        var editing_config_node = RED.nodes.node(id);
        var nodeInfoEditor;
        var finishedBuilding = false;

        var ns;
        if (node_def.set.module === "node-red") {
            ns = "node-red";
        } else {
            ns = node_def.set.id;
        }
        var configNodeScope = ""; // default to global
        var activeSubflow = RED.nodes.subflow(RED.workspaces.active());
        if (activeSubflow) {
            configNodeScope = activeSubflow.id;
        }
        if (editing_config_node == null) {
            editing_config_node = {
                id: RED.nodes.id(),
                _def: node_def,
                type: type,
                z: configNodeScope,
                users: []
            }
            for (var d in node_def.defaults) {
                if (node_def.defaults[d].value) {
                    editing_config_node[d] = JSON.parse(JSON.stringify(node_def.defaults[d].value));
                }
            }
            editing_config_node["_"] = node_def._;
        }
        editStack.push(editing_config_node);

        RED.view.state(RED.state.EDITING);
        var trayOptions = {
            title: getEditStackTitle(), //(adding?RED._("editor.addNewConfig", {type:type}):RED._("editor.editConfig", {type:type})),
            resize: function(dimensions) {
                $(".red-ui-tray-content").height(dimensions.height - 50);
                if (editing_config_node && editing_config_node._def.oneditresize) {
                    var form = $("#node-config-dialog-edit-form");
                    try {
                        editing_config_node._def.oneditresize.call(editing_config_node,{width:form.width(),height:form.height()});
                    } catch(err) {
                        console.log("oneditresize",editing_config_node.id,editing_config_node.type,err.toString());
                    }
                }
            },
            open: function(tray, done) {
                var trayHeader = tray.find(".red-ui-tray-header");
                var trayBody = tray.find('.red-ui-tray-body');
                var trayFooter = tray.find(".red-ui-tray-footer");

                var trayFooterLeft = $('<div class="red-ui-tray-footer-left"></div>').appendTo(trayFooter)

                $('<input id="node-config-input-node-disabled" type="checkbox">').prop("checked",!!editing_config_node.d).appendTo(trayFooterLeft).toggleButton({
                    enabledIcon: "fa-circle-thin",
                    disabledIcon: "fa-ban",
                    invertState: true
                })

                if (node_def.hasUsers !== false) {
                    $('<span><i class="fa fa-info-circle"></i> <span id="red-ui-editor-config-user-count"></span></span>').css("margin-left", "10px").appendTo(trayFooterLeft);
                }
                trayFooter.append('<span class="red-ui-tray-footer-right"><span id="red-ui-editor-config-scope-warning" data-i18n="[title]editor.errors.scopeChange"><i class="fa fa-warning"></i></span><select id="red-ui-editor-config-scope"></select></span>');

                var editorTabEl = $('<ul></ul>').appendTo(trayBody);
                var editorContent = $('<div></div>').appendTo(trayBody);

                var editorTabs = RED.tabs.create({
                    element:editorTabEl,
                    onchange:function(tab) {
                        editorContent.children().hide();
                        if (tab.onchange) {
                            tab.onchange.call(tab);
                        }
                        tab.content.show();
                        if (finishedBuilding) {
                            RED.tray.resize();
                        }
                    },
                    collapsible: true,
                    menu: false
                });

                var nodePropertiesTab = {
                    id: "editor-tab-cproperties",
                    label: RED._("editor-tab.properties"),
                    name: RED._("editor-tab.properties"),
                    content: $('<div>', {class:"red-ui-tray-content"}).appendTo(editorContent).hide(),
                    iconClass: "fa fa-cog"
                };
                editorTabs.addTab(nodePropertiesTab);
                buildEditForm(nodePropertiesTab.content,"node-config-dialog-edit-form",type,ns);

                if (!node_def.defaults || !node_def.defaults.hasOwnProperty('info'))  {
                    var descriptionTab = {
                        id: "editor-tab-description",
                        label: RED._("editor-tab.description"),
                        name: RED._("editor-tab.description"),
                        content: $('<div>', {class:"red-ui-tray-content"}).appendTo(editorContent).hide(),
                        iconClass: "fa fa-file-text-o",
                        onchange: function() {
                            nodeInfoEditor.focus();
                        }
                    };
                    editorTabs.addTab(descriptionTab);
                    nodeInfoEditor = buildDescriptionForm(descriptionTab.content,editing_config_node);
                }


                prepareEditDialog(editing_config_node,node_def,"node-config-input", function() {
                    if (editing_config_node._def.exclusive) {
                        $("#red-ui-editor-config-scope").hide();
                    } else {
                        $("#red-ui-editor-config-scope").show();
                    }
                    $("#red-ui-editor-config-scope-warning").hide();

                    var nodeUserFlows = {};
                    editing_config_node.users.forEach(function(n) {
                        nodeUserFlows[n.z] = true;
                    });
                    var flowCount = Object.keys(nodeUserFlows).length;
                    var tabSelect = $("#red-ui-editor-config-scope").empty();
                    tabSelect.off("change");
                    tabSelect.append('<option value=""'+(!editing_config_node.z?" selected":"")+' data-i18n="sidebar.config.global"></option>');
                    tabSelect.append('<option disabled data-i18n="sidebar.config.flows"></option>');
                    RED.nodes.eachWorkspace(function(ws) {
                        var workspaceLabel = ws.label;
                        if (nodeUserFlows[ws.id]) {
                            workspaceLabel = "* "+workspaceLabel;
                        }
                        $('<option value="'+ws.id+'"'+(ws.id==editing_config_node.z?" selected":"")+'></option>').text(workspaceLabel).appendTo(tabSelect);
                    });
                    tabSelect.append('<option disabled data-i18n="sidebar.config.subflows"></option>');
                    RED.nodes.eachSubflow(function(ws) {
                        var workspaceLabel = ws.name;
                        if (nodeUserFlows[ws.id]) {
                            workspaceLabel = "* "+workspaceLabel;
                        }
                        $('<option value="'+ws.id+'"'+(ws.id==editing_config_node.z?" selected":"")+'></option>').text(workspaceLabel).appendTo(tabSelect);
                    });
                    if (flowCount > 0) {
                        tabSelect.on('change',function() {
                            var newScope = $(this).val();
                            if (newScope === '') {
                                // global scope - everyone can use it
                                $("#red-ui-editor-config-scope-warning").hide();
                            } else if (!nodeUserFlows[newScope] || flowCount > 1) {
                                // a user will loose access to it
                                $("#red-ui-editor-config-scope-warning").show();
                            } else {
                                $("#red-ui-editor-config-scope-warning").hide();
                            }
                        });
                    }
                    if (node_def.hasUsers !== false) {
                        $("#red-ui-editor-config-user-count").text(RED._("editor.nodesUse", {count:editing_config_node.users.length})).parent().show();
                    }
                    trayBody.i18n();
                    trayFooter.i18n();
                    finishedBuilding = true;
                    done();
                });
            },
            close: function() {
                RED.workspaces.refresh();
                if (nodeInfoEditor) {
                    nodeInfoEditor.destroy();
                    nodeInfoEditor = null;
                }
                editStack.pop();
            },
            show: function() {
                if (editing_config_node) {
                    RED.sidebar.info.refresh(editing_config_node);
                    RED.sidebar.help.show(type, false);
                }
            }
        }
        trayOptions.buttons = [
            {
                id: "node-config-dialog-cancel",
                text: RED._("common.label.cancel"),
                click: function() {
                    var configType = type;
                    var configId = editing_config_node.id;
                    var configAdding = adding;
                    var configTypeDef = RED.nodes.getType(configType);
                    if (configTypeDef.oneditcancel) {
                        // TODO: what to pass as this to call
                        if (configTypeDef.oneditcancel) {
                            var cn = RED.nodes.node(configId);
                            if (cn) {
                                try {
                                    configTypeDef.oneditcancel.call(cn,false);
                                } catch(err) {
                                    console.log("oneditcancel",cn.id,cn.type,err.toString());
                                }
                            } else {
                                try {
                                    configTypeDef.oneditcancel.call({id:configId},true);
                                } catch(err) {
                                    console.log("oneditcancel",configId,configType,err.toString());
                                }
                            }
                        }
                    }
                    RED.tray.close();
                }
            },
            {
                id: "node-config-dialog-ok",
                text: adding?RED._("editor.configAdd"):RED._("editor.configUpdate"),
                class: "primary",
                click: function() {
                    var configProperty = name;
                    var configId = editing_config_node.id;
                    var configType = type;
                    var configAdding = adding;
                    var configTypeDef = RED.nodes.getType(configType);
                    var d;
                    var input;
                    var scope = $("#red-ui-editor-config-scope").val();

                    if (configTypeDef.oneditsave) {
                        try {
                            configTypeDef.oneditsave.call(editing_config_node);
                        } catch(err) {
                            console.log("oneditsave",editing_config_node.id,editing_config_node.type,err.toString());
                        }
                    }

                    for (d in configTypeDef.defaults) {
                        if (configTypeDef.defaults.hasOwnProperty(d)) {
                            var newValue;
                            input = $("#node-config-input-"+d);
                            if (input.attr('type') === "checkbox") {
                                newValue = input.prop('checked');
                            } else if ("format" in configTypeDef.defaults[d] && configTypeDef.defaults[d].format !== "" && input[0].nodeName === "DIV") {
                                newValue = input.text();
                            } else {
                                newValue = input.val();
                            }
                            if (newValue != null && newValue !== editing_config_node[d]) {
                                if (editing_config_node._def.defaults[d].type) {
                                    if (newValue == "_ADD_") {
                                        newValue = "";
                                    }
                                    // Change to a related config node
                                    var configNode = RED.nodes.node(editing_config_node[d]);
                                    if (configNode) {
                                        var users = configNode.users;
                                        users.splice(users.indexOf(editing_config_node),1);
                                        RED.events.emit("nodes:change",configNode);
                                    }
                                    configNode = RED.nodes.node(newValue);
                                    if (configNode) {
                                        configNode.users.push(editing_config_node);
                                        RED.events.emit("nodes:change",configNode);
                                    }
                                }
                                editing_config_node[d] = newValue;
                            }
                        }
                    }

                    if (nodeInfoEditor) {
                        editing_config_node.info = nodeInfoEditor.getValue();

                        var oldInfo = editing_config_node.info;
                        if (nodeInfoEditor) {
                            var newInfo = nodeInfoEditor.getValue();
                            if (!!oldInfo) {
                                // Has existing info property
                                if (newInfo.trim() === "") {
                                    // New value is blank - remove the property
                                    delete editing_config_node.info;
                                } else if (newInfo !== oldInfo) {
                                    // New value is different
                                    editing_config_node.info = newInfo;
                                }
                            } else {
                                // No existing info
                                if (newInfo.trim() !== "") {
                                    // New value is not blank
                                    editing_config_node.info = newInfo;
                                }
                            }
                        }
                    }
                    editing_config_node.label = configTypeDef.label;
                    editing_config_node.z = scope;

                    if ($("#node-config-input-node-disabled").prop('checked')) {
                        if (editing_config_node.d !== true) {
                            editing_config_node.d = true;
                        }
                    } else {
                        if (editing_config_node.d === true) {
                            delete editing_config_node.d;
                        }
                    }

                    if (scope) {
                        // Search for nodes that use this one that are no longer
                        // in scope, so must be removed
                        editing_config_node.users = editing_config_node.users.filter(function(n) {
                            var keep = true;
                            for (var d in n._def.defaults) {
                                if (n._def.defaults.hasOwnProperty(d)) {
                                    if (n._def.defaults[d].type === editing_config_node.type &&
                                        n[d] === editing_config_node.id &&
                                        n.z !== scope) {
                                            keep = false;
                                            // Remove the reference to this node
                                            // and revalidate
                                            n[d] = null;
                                            n.dirty = true;
                                            n.changed = true;
                                            validateNode(n);
                                    }
                                }
                            }
                            return keep;
                        });
                    }

                    if (configAdding) {
                        RED.nodes.add(editing_config_node);
                    }

                    if (configTypeDef.credentials) {
                        updateNodeCredentials(editing_config_node,configTypeDef.credentials,"node-config-input");
                    }
                    validateNode(editing_config_node);
                    var validatedNodes = {};
                    validatedNodes[editing_config_node.id] = true;

                    var userStack = editing_config_node.users.slice();
                    while(userStack.length > 0) {
                        var user = userStack.pop();
                        if (!validatedNodes[user.id]) {
                            validatedNodes[user.id] = true;
                            if (user.users) {
                                userStack = userStack.concat(user.users);
                            }
                            validateNode(user);
                        }
                    }
                    RED.nodes.dirty(true);
                    RED.view.redraw(true);
                    if (!configAdding) {
                        RED.events.emit("editor:save",editing_config_node);
                        RED.events.emit("nodes:change",editing_config_node);
                    }
                    RED.tray.close(function() {
                        updateConfigNodeSelect(configProperty,configType,editing_config_node.id,prefix);
                    });
                }
            }
        ];

        if (!adding) {
            trayOptions.buttons.unshift({
                class: 'leftButton',
                text: RED._("editor.configDelete"), //'<i class="fa fa-trash"></i>',
                click: function() {
                    var configProperty = name;
                    var configId = editing_config_node.id;
                    var configType = type;
                    var configTypeDef = RED.nodes.getType(configType);

                    try {

                        if (configTypeDef.ondelete) {
                            // Deprecated: never documented but used by some early nodes
                            console.log("Deprecated API warning: config node type ",configType," has an ondelete function - should be oneditdelete");
                            configTypeDef.ondelete.call(editing_config_node);
                        }
                        if (configTypeDef.oneditdelete) {
                            configTypeDef.oneditdelete.call(editing_config_node);
                        }
                    } catch(err) {
                        console.log("oneditdelete",editing_config_node.id,editing_config_node.type,err.toString());
                    }

                    var historyEvent = {
                        t:'delete',
                        nodes:[editing_config_node],
                        changes: {},
                        dirty: RED.nodes.dirty()
                    }
                    for (var i=0;i<editing_config_node.users.length;i++) {
                        var user = editing_config_node.users[i];
                        historyEvent.changes[user.id] = {
                            changed: user.changed,
                            valid: user.valid
                        };
                        for (var d in user._def.defaults) {
                            if (user._def.defaults.hasOwnProperty(d) && user[d] == configId) {
                                historyEvent.changes[user.id][d] = configId
                                user[d] = "";
                                user.changed = true;
                                user.dirty = true;
                            }
                        }
                        validateNode(user);
                    }
                    RED.nodes.remove(configId);
                    RED.nodes.dirty(true);
                    RED.view.redraw(true);
                    RED.history.push(historyEvent);
                    RED.tray.close(function() {
                        updateConfigNodeSelect(configProperty,configType,"",prefix);
                    });
                }
            });
        }

        RED.tray.show(trayOptions);
    }

    function defaultConfigNodeSort(A,B) {
        if (A.__label__ < B.__label__) {
            return -1;
        } else if (A.__label__ > B.__label__) {
            return 1;
        }
        return 0;
    }

    function updateConfigNodeSelect(name,type,value,prefix) {
        // if prefix is null, there is no config select to update
        if (prefix) {
            var button = $("#"+prefix+"-edit-"+name);
            if (button.length) {
                if (value) {
                    button.text(RED._("editor.configEdit"));
                } else {
                    button.text(RED._("editor.configAdd"));
                }
                $("#"+prefix+"-"+name).val(value);
            } else {

                var select = $("#"+prefix+"-"+name);
                var node_def = RED.nodes.getType(type);
                select.children().remove();

                var activeWorkspace = RED.nodes.workspace(RED.workspaces.active());
                if (!activeWorkspace) {
                    activeWorkspace = RED.nodes.subflow(RED.workspaces.active());
                }

                var configNodes = [];

                RED.nodes.eachConfig(function(config) {
                    if (config.type == type && (!config.z || config.z === activeWorkspace.id)) {
                        var label = RED.utils.getNodeLabel(config,config.id);
                        config.__label__ = label+(config.d?" ["+RED._("workspace.disabled")+"]":"");
                        configNodes.push(config);
                    }
                });
                var configSortFn = defaultConfigNodeSort;
                if (typeof node_def.sort == "function") {
                    configSortFn = node_def.sort;
                }
                try {
                    configNodes.sort(configSortFn);
                } catch(err) {
                    console.log("Definition error: "+node_def.type+".sort",err);
                }

                configNodes.forEach(function(cn) {
                    $('<option value="'+cn.id+'"'+(value==cn.id?" selected":"")+'></option>').text(RED.text.bidi.enforceTextDirectionWithUCC(cn.__label__)).appendTo(select);
                    delete cn.__label__;
                });

                select.append('<option value="_ADD_"'+(value===""?" selected":"")+'>'+RED._("editor.addNewType", {type:type})+'</option>');
                window.setTimeout(function() { select.trigger("change");},50);
            }
        }
    }

    function showEditSubflowDialog(subflow) {
        var editing_node = subflow;
        editStack.push(subflow);
        RED.view.state(RED.state.EDITING);
        var subflowEditor;
        var finishedBuilding = false;
        var trayOptions = {
            title: getEditStackTitle(),
            buttons: [
                {
                    id: "node-dialog-cancel",
                    text: RED._("common.label.cancel"),
                    click: function() {
                        RED.tray.close();
                    }
                },
                {
                    id: "node-dialog-ok",
                    class: "primary",
                    text: RED._("common.label.done"),
                    click: function() {
                        var i;
                        var changes = {};
                        var changed = false;
                        var wasDirty = RED.nodes.dirty();

                        var newName = $("#subflow-input-name").val();

                        if (newName != editing_node.name) {
                            changes['name'] = editing_node.name;
                            editing_node.name = newName;
                            changed = true;
                        }

                        var newDescription = subflowEditor.getValue();

                        if (newDescription != editing_node.info) {
                            changes['info'] = editing_node.info;
                            editing_node.info = newDescription;
                            changed = true;
                        }
                        if (updateLabels(editing_node, changes, null)) {
                            changed = true;
                        }
                        var icon = $("#red-ui-editor-node-icon").val()||"";
                        if ((editing_node.icon === undefined && icon !== "node-red/subflow.svg") ||
                            (editing_node.icon !== undefined && editing_node.icon !== icon)) {
                            changes.icon = editing_node.icon;
                            editing_node.icon = icon;
                            changed = true;
                        }
                        var newCategory = $("#subflow-appearance-input-category").val().trim();
                        if (newCategory === "_custom_") {
                            newCategory = $("#subflow-appearance-input-custom-category").val().trim();
                            if (newCategory === "") {
                                newCategory = editing_node.category;
                            }
                        }
                        if (newCategory === 'subflows') {
                            newCategory = '';
                        }
                        if (newCategory != editing_node.category) {
                            changes['category'] = editing_node.category;
                            editing_node.category = newCategory;
                            changed = true;
                        }

                        var oldColor = editing_node.color;
                        var newColor =  $("#red-ui-editor-node-color").val();
                        if (oldColor !== newColor) {
                            editing_node.color = newColor;
                            changes.color = newColor;
                            changed = true;
                            RED.utils.clearNodeColorCache();
                            if (editing_node.type === "subflow") {
                                var nodeDefinition = RED.nodes.getType(
                                    "subflow:" + editing_node.id
                                );
                                nodeDefinition["color"] = newColor;
                            }
                        }

                        var old_env = editing_node.env;
                        var new_env = RED.subflow.exportSubflowTemplateEnv($("#node-input-env-container").editableList("items"));

                        if (new_env && new_env.length > 0) {
                            new_env.forEach(function(prop) {
                                if (prop.type === "cred") {
                                    editing_node.credentials = editing_node.credentials || {_:{}};
                                    editing_node.credentials[prop.name] = prop.value;
                                    editing_node.credentials['has_'+prop.name] = (prop.value !== "");
                                    if (prop.value !== '__PWRD__') {
                                        changed = true;
                                    }
                                    delete prop.value;
                                }
                            });
                        }

                        if (!isSameObj(old_env, new_env)) {
                            editing_node.env = new_env;
                            changes.env = editing_node.env;
                            changed = true;
                        }

                        if (changed) {
                            var wasChanged = editing_node.changed;
                            editing_node.changed = true;
                            validateNode(editing_node);
                            var subflowInstances = [];
                            RED.nodes.eachNode(function(n) {
                                if (n.type == "subflow:"+editing_node.id) {
                                    subflowInstances.push({
                                        id:n.id,
                                        changed:n.changed
                                    })
                                    n._def.color = editing_node.color;
                                    n.changed = true;
                                    n.dirty = true;
                                    updateNodeProperties(n);
                                    validateNode(n);
                                }
                            });
                            RED.events.emit("subflows:change",editing_node);
                            RED.nodes.dirty(true);
                            var historyEvent = {
                                t:'edit',
                                node:editing_node,
                                changes:changes,
                                dirty:wasDirty,
                                changed:wasChanged,
                                subflow: {
                                    instances:subflowInstances
                                }
                            };

                            RED.history.push(historyEvent);
                        }
                        editing_node.dirty = true;
                        RED.tray.close();
                    }
                }
            ],
            resize: function(size) {
                $(".red-ui-tray-content").height(size.height - 50);
                var envContainer = $("#node-input-env-container");
                if (envContainer.length) {
                    // var form = $(".red-ui-tray-content form").height(size.height - 50 - 40);
                    var rows = $("#dialog-form>div:not(#subflow-env-tabs-content)");
                    var height = size.height;
                    for (var i=0; i<rows.size(); i++) {
                        height -= $(rows[i]).outerHeight(true);
                    }
                    // var editorRow = $("#dialog-form>div.node-input-env-container-row");
                    // height -= (parseInt(editorRow.css("marginTop"))+parseInt(editorRow.css("marginBottom")));
                    $("#node-input-env-container").editableList('height',height-95);
                }
            },
            open: function(tray, done) {
                var trayFooter = tray.find(".red-ui-tray-footer");
                var trayFooterLeft = $("<div/>", {
                    class: "red-ui-tray-footer-left"
                }).appendTo(trayFooter)
                var trayBody = tray.find('.red-ui-tray-body');
                trayBody.parent().css('overflow','hidden');

                if (editing_node.type === "subflow") {
                    var span = $("<span/>").css({
                        "margin-left": "10px"
                    }).appendTo(trayFooterLeft);
                    $("<i/>", {
                        class: "fa fa-info-circle"
                    }).appendTo(span);
                    $("<span/>").text(" ").appendTo(span);
                    $("<i/>", {
                        id: "red-ui-editor-subflow-user-count"
                    }).appendTo(span);
                }

                if (editing_node) {
                    RED.sidebar.info.refresh(editing_node);
                }

                var editorTabEl = $('<ul></ul>').appendTo(trayBody);
                var editorContent = $('<div></div>').appendTo(trayBody);

                var editorTabs = RED.tabs.create({
                    element:editorTabEl,
                    onchange:function(tab) {
                        editorContent.children().hide();
                        if (tab.onchange) {
                            tab.onchange.call(tab);
                        }
                        tab.content.show();
                        if (finishedBuilding) {
                            RED.tray.resize();
                        }
                    },
                    collapsible: true,
                    menu: false
                });

                var nodePropertiesTab = {
                    id: "editor-tab-properties",
                    label: RED._("editor-tab.properties"),
                    name: RED._("editor-tab.properties"),
                    content: $('<div>', {class:"red-ui-tray-content"}).appendTo(editorContent).hide(),
                    iconClass: "fa fa-cog"
                };
                editorTabs.addTab(nodePropertiesTab);

                var descriptionTab = {
                    id: "editor-tab-description",
                    label: RED._("editor-tab.description"),
                    name: RED._("editor-tab.description"),
                    content: $('<div>', {class:"red-ui-tray-content"}).appendTo(editorContent).hide(),
                    iconClass: "fa fa-file-text-o",
                    onchange: function() {
                        subflowEditor.focus();
                    }
                };
                editorTabs.addTab(descriptionTab);
                subflowEditor = buildDescriptionForm(descriptionTab.content,editing_node);

                var appearanceTab = {
                    id: "editor-tab-appearance",
                    label: RED._("editor-tab.appearance"),
                    name: RED._("editor-tab.appearance"),
                    content: $('<div>', {class:"red-ui-tray-content"}).appendTo(editorContent).hide(),
                    iconClass: "fa fa-object-group",
                    onchange: function() {
                        refreshLabelForm(this.content,editing_node);
                    }
                };
                buildAppearanceForm(appearanceTab.content,editing_node);
                editorTabs.addTab(appearanceTab);

                buildEditForm(nodePropertiesTab.content,"dialog-form","subflow-template", undefined, editing_node);
                trayBody.i18n();

                $.getJSON(getCredentialsURL("subflow", subflow.id), function (data) {
                    subflow.credentials = data;
                    subflow.credentials._ = $.extend(true,{},data);

                    $("#subflow-input-name").val(subflow.name);
                    RED.text.bidi.prepareInput($("#subflow-input-name"));

                    finishedBuilding = true;
                    done();
                });
            },
            close: function() {
                if (RED.view.state() != RED.state.IMPORT_DRAGGING) {
                    RED.view.state(RED.state.DEFAULT);
                }
                RED.sidebar.info.refresh(editing_node);
                RED.workspaces.refresh();
                subflowEditor.destroy();
                subflowEditor = null;
                editStack.pop();
                editing_node = null;
            },
            show: function() {
            }
        }
        RED.tray.show(trayOptions);
    }

    function showEditGroupDialog(group) {
        var editing_node = group;
        editStack.push(group);
        RED.view.state(RED.state.EDITING);
        var nodeInfoEditor;
        var finishedBuilding = false;
        var trayOptions = {
            title: getEditStackTitle(),
            buttons: [
                {
                    id: "node-dialog-cancel",
                    text: RED._("common.label.cancel"),
                    click: function() {
                        RED.tray.close();
                    }
                },
                {
                    id: "node-dialog-ok",
                    class: "primary",
                    text: RED._("common.label.done"),
                    click: function() {
                        var changes = {};
                        var changed = false;
                        var wasDirty = RED.nodes.dirty();
                        var d;
                        var outputMap;

                        if (editing_node._def.oneditsave) {
                            var oldValues = {};
                            for (d in editing_node._def.defaults) {
                                if (editing_node._def.defaults.hasOwnProperty(d)) {
                                    if (typeof editing_node[d] === "string" || typeof editing_node[d] === "number") {
                                        oldValues[d] = editing_node[d];
                                    } else {
                                        oldValues[d] = $.extend(true,{},{v:editing_node[d]}).v;
                                    }
                                }
                            }
                            try {
                                var rc = editing_node._def.oneditsave.call(editing_node);
                                if (rc === true) {
                                    changed = true;
                                }
                            } catch(err) {
                                console.log("oneditsave",editing_node.id,editing_node.type,err.toString());
                            }

                            for (d in editing_node._def.defaults) {
                                if (editing_node._def.defaults.hasOwnProperty(d)) {
                                    if (oldValues[d] === null || typeof oldValues[d] === "string" || typeof oldValues[d] === "number") {
                                        if (oldValues[d] !== editing_node[d]) {
                                            changes[d] = oldValues[d];
                                            changed = true;
                                        }
                                    } else if (d !== "nodes") {
                                        if (JSON.stringify(oldValues[d]) !== JSON.stringify(editing_node[d])) {
                                            changes[d] = oldValues[d];
                                            changed = true;
                                        }
                                    }
                                }
                            }
                        }

                        var newValue;
                        if (editing_node._def.defaults) {
                            for (d in editing_node._def.defaults) {
                                if (editing_node._def.defaults.hasOwnProperty(d)) {
                                    var input = $("#node-input-"+d);
                                    if (input.attr('type') === "checkbox") {
                                        newValue = input.prop('checked');
                                    } else if (input.prop("nodeName") === "select" && input.attr("multiple") === "multiple") {
                                        // An empty select-multiple box returns null.
                                        // Need to treat that as an empty array.
                                        newValue = input.val();
                                        if (newValue == null) {
                                            newValue = [];
                                        }
                                    } else if ("format" in editing_node._def.defaults[d] && editing_node._def.defaults[d].format !== "" && input[0].nodeName === "DIV") {
                                        newValue = input.text();
                                    } else {
                                        newValue = input.val();
                                    }
                                    if (newValue != null) {
                                        if (editing_node._def.defaults[d].type) {
                                            if (newValue == "_ADD_") {
                                                newValue = "";
                                            }
                                        }
                                        if (editing_node[d] != newValue) {
                                            if (editing_node._def.defaults[d].type) {
                                                // Change to a related config node
                                                var configNode = RED.nodes.node(editing_node[d]);
                                                if (configNode) {
                                                    var users = configNode.users;
                                                    users.splice(users.indexOf(editing_node),1);
                                                    RED.events.emit("nodes:change",configNode);
                                                }
                                                configNode = RED.nodes.node(newValue);
                                                if (configNode) {
                                                    configNode.users.push(editing_node);
                                                    RED.events.emit("nodes:change",configNode);
                                                }
                                            }
                                            changes[d] = editing_node[d];
                                            editing_node[d] = newValue;
                                            changed = true;
                                        }
                                    }
                                }
                            }
                        }

                        var oldInfo = editing_node.info;
                        if (nodeInfoEditor) {
                            var newInfo = nodeInfoEditor.getValue();
                            if (!!oldInfo) {
                                // Has existing info property
                                if (newInfo.trim() === "") {
                                    // New value is blank - remove the property
                                    changed = true;
                                    changes.info = oldInfo;
                                    delete editing_node.info;
                                } else if (newInfo !== oldInfo) {
                                    // New value is different
                                    changed = true;
                                    changes.info = oldInfo;
                                    editing_node.info = newInfo;
                                }
                            } else {
                                // No existing info
                                if (newInfo.trim() !== "") {
                                    // New value is not blank
                                    changed = true;
                                    changes.info = undefined;
                                    editing_node.info = newInfo;
                                }
                            }
                        }
                        if (changed) {
                            var wasChanged = editing_node.changed;
                            editing_node.changed = true;
                            RED.nodes.dirty(true);
                            var historyEvent = {
                                t:'edit',
                                node:editing_node,
                                changes:changes,
                                dirty:wasDirty,
                                changed:wasChanged
                            };
                            RED.history.push(historyEvent);
                            RED.events.emit("groups:change",editing_node);
                        }
                        editing_node.dirty = true;
                        RED.tray.close();
                        RED.view.redraw(true);
                    }
                }
            ],
            resize: function(size) {
                editTrayWidthCache['group'] = size.width;
                $(".red-ui-tray-content").height(size.height - 50);
                // var form = $(".red-ui-tray-content form").height(dimensions.height - 50 - 40);
                // if (editing_node && editing_node._def.oneditresize) {
                //     try {
                //         editing_node._def.oneditresize.call(editing_node,{width:form.width(),height:form.height()});
                //     } catch(err) {
                //         console.log("oneditresize",editing_node.id,editing_node.type,err.toString());
                //     }
                // }
            },
            open: function(tray, done) {
                var trayFooter = tray.find(".red-ui-tray-footer");
                var trayFooterLeft = $("<div/>", {
                    class: "red-ui-tray-footer-left"
                }).appendTo(trayFooter)
                var trayBody = tray.find('.red-ui-tray-body');
                trayBody.parent().css('overflow','hidden');

                var editorTabEl = $('<ul></ul>').appendTo(trayBody);
                var editorContent = $('<div></div>').appendTo(trayBody);

                var editorTabs = RED.tabs.create({
                    element:editorTabEl,
                    onchange:function(tab) {
                        editorContent.children().hide();
                        if (tab.onchange) {
                            tab.onchange.call(tab);
                        }
                        tab.content.show();
                        if (finishedBuilding) {
                            RED.tray.resize();
                        }
                    },
                    collapsible: true,
                    menu: false
                });

                var nodePropertiesTab = {
                    id: "editor-tab-properties",
                    label: RED._("editor-tab.properties"),
                    name: RED._("editor-tab.properties"),
                    content: $('<div>', {class:"red-ui-tray-content"}).appendTo(editorContent).hide(),
                    iconClass: "fa fa-cog"
                };
                buildEditForm(nodePropertiesTab.content,"dialog-form","group","node-red",group);

                editorTabs.addTab(nodePropertiesTab);

                var descriptionTab = {
                    id: "editor-tab-description",
                    label: RED._("editor-tab.description"),
                    name: RED._("editor-tab.description"),
                    content: $('<div>', {class:"red-ui-tray-content"}).appendTo(editorContent).hide(),
                    iconClass: "fa fa-file-text-o",
                    onchange: function() {
                        nodeInfoEditor.focus();
                    }
                };
                editorTabs.addTab(descriptionTab);
                nodeInfoEditor = buildDescriptionForm(descriptionTab.content,editing_node);
                prepareEditDialog(group,group._def,"node-input", function() {
                    trayBody.i18n();
                    finishedBuilding = true;
                    done();
                });
            },
            close: function() {
                if (RED.view.state() != RED.state.IMPORT_DRAGGING) {
                    RED.view.state(RED.state.DEFAULT);
                }
                RED.sidebar.info.refresh(editing_node);
                nodeInfoEditor.destroy();
                nodeInfoEditor = null;
                editStack.pop();
                editing_node = null;
            },
            show: function() {
            }
        }

        if (editTrayWidthCache.hasOwnProperty('group')) {
            trayOptions.width = editTrayWidthCache['group'];
        }
        RED.tray.show(trayOptions);
    }

    function showTypeEditor(type, options) {
        if (customEditTypes.hasOwnProperty(type)) {
            if (editStack.length > 0) {
                options.parent = editStack[editStack.length-1].id;
            }
            editStack.push({type:type});
            options.title = options.title || getEditStackTitle();
            options.onclose = function() {
                editStack.pop();
            }
            customEditTypes[type].show(options);
        } else {
            console.log("Unknown type editor:",type);
        }
    }

    function createEditor(options) {
        var el = options.element || $("#"+options.id)[0];
        var toolbarRow = $("<div>").appendTo(el);
        el = $("<div>").appendTo(el).addClass("red-ui-editor-text-container")[0];
        var editor = ace.edit(el);
        editor.setTheme("ace/theme/tomorrow");
        var session = editor.getSession();
        session.on("changeAnnotation", function () {
            var annotations = session.getAnnotations() || [];
            var i = annotations.length;
            var len = annotations.length;
            while (i--) {
                if (/doctype first\. Expected/.test(annotations[i].text)) { annotations.splice(i, 1); }
                else if (/Unexpected End of file\. Expected/.test(annotations[i].text)) { annotations.splice(i, 1); }
            }
            if (len > annotations.length) { session.setAnnotations(annotations); }
        });
        if (options.mode) {
            session.setMode(options.mode);
        }
        if (options.foldStyle) {
            session.setFoldStyle(options.foldStyle);
        } else {
            session.setFoldStyle('markbeginend');
        }
        if (options.options) {
            editor.setOptions(options.options);
        } else {
            editor.setOptions({
                enableBasicAutocompletion:true,
                enableSnippets:true,
                tooltipFollowsMouse: false
            });
        }
        if (options.readOnly) {
            editor.setOption('readOnly',options.readOnly);
            editor.container.classList.add("ace_read-only");
        }
        if (options.hasOwnProperty('lineNumbers')) {
            editor.renderer.setOption('showGutter',options.lineNumbers);
        }
        editor.$blockScrolling = Infinity;
        if (options.value) {
            session.setValue(options.value,-1);
        }
        if (options.globals) {
            setTimeout(function() {
                if (!!session.$worker) {
                    session.$worker.send("setOptions", [{globals: options.globals, maxerr:1000}]);
                }
            },100);
        }
        if (options.mode === 'ace/mode/markdown') {
            $(el).addClass("red-ui-editor-text-container-toolbar");
            editor.toolbar = customEditTypes['_markdown'].buildToolbar(toolbarRow,editor);
            if (options.expandable !== false) {
                var expandButton = $('<button type="button" class="red-ui-button" style="float: right;"><i class="fa fa-expand"></i></button>').appendTo(editor.toolbar);
                RED.popover.tooltip(expandButton, RED._("markdownEditor.expand"));
                expandButton.on("click", function(e) {
                    e.preventDefault();
                    var value = editor.getValue();
                    RED.editor.editMarkdown({
                        value: value,
                        width: "Infinity",
                        cursor: editor.getCursorPosition(),
                        complete: function(v,cursor) {
                            editor.setValue(v, -1);
                            editor.gotoLine(cursor.row+1,cursor.column,false);
                            setTimeout(function() {
                                editor.focus();
                            },300);
                        }
                    })
                });
            }
            var helpButton = $('<button type="button" class="red-ui-editor-text-help red-ui-button red-ui-button-small"><i class="fa fa-question"></i></button>').appendTo($(el).parent());
            RED.popover.create({
                target: helpButton,
                trigger: 'click',
                size: "small",
                direction: "left",
                content: RED._("markdownEditor.format"),
                autoClose: 50
            });
            session.setUseWrapMode(true);
        }
        return editor;
    }

    return {
        init: function() {
            ace.config.set('basePath', 'vendor/ace');
            RED.tray.init();
            RED.actions.add("core:confirm-edit-tray", function() {
                $(document.activeElement).blur();
                $("#node-dialog-ok").trigger("click");
                $("#node-config-dialog-ok").trigger("click");
            });
            RED.actions.add("core:cancel-edit-tray", function() {
                $(document.activeElement).blur();
                $("#node-dialog-cancel").trigger("click");
                $("#node-config-dialog-cancel").trigger("click");
            });
        },
        edit: showEditDialog,
        editConfig: showEditConfigNodeDialog,
        editSubflow: showEditSubflowDialog,
        editGroup: showEditGroupDialog,
        editJavaScript: function(options) { showTypeEditor("_js",options) },
        editExpression: function(options) { showTypeEditor("_expression", options) },
        editJSON: function(options) { showTypeEditor("_json", options) },
        editMarkdown: function(options) { showTypeEditor("_markdown", options) },
        editText: function(options) {
            if (options.mode == "markdown") {
                showTypeEditor("_markdown", options)
            } else {
                showTypeEditor("_text", options)
            }
        },
        editBuffer: function(options) { showTypeEditor("_buffer", options) },
        buildEditForm: buildEditForm,
        validateNode: validateNode,
        updateNodeProperties: updateNodeProperties, // TODO: only exposed for edit-undo

        showIconPicker:showIconPicker,

        /**
         * Show a type editor.
         * @param {string} type - the type to display
         * @param {object} options - options for the editor
         * @function
         * @memberof RED.editor
         */
        showTypeEditor: showTypeEditor,

        /**
         * Register a type editor.
         * @param {string} type - the type name
         * @param {object} definition - the editor definition
         * @function
         * @memberof RED.editor
         */
        registerTypeEditor: function(type, definition) {
            customEditTypes[type] = definition;
        },

        /**
         * Create a editor ui component
         * @param {object} options - the editor options
         * @function
         * @memberof RED.editor
         */
        createEditor: createEditor
    }
})();
