Ext.define('CA.technicalservices.userutilities.ProjectUtility',{
    singleton: true,

    permissions: {
        __permissionAdmin: 'Project Admin',
        __permissionEditor: 'Editor',
        __permissionViewer: 'Viewer',
        __permissionNoAccess: 'No Access'
    },
    initialize: function(){
        var deferred = Ext.create('Deft.Deferred');

        Ext.create('Rally.data.wsapi.Store',{
            model: 'Project',
            fetch: ['ObjectID','Name','Parent','Workspace'],
            limit: Infinity,
            context: {project: null},
            compact: false,
            filters: [{
                property: 'State',
                value: 'Open'
            }],
            sorters: [{
                property: 'ObjectID',
                direction: 'ASC'
            }]
        }).load({
            callback: function(records, operation){
                if (operation.wasSuccessful()){
                    CA.technicalservices.userutilities.ProjectUtility.initializeRecords(records);
                    deferred.resolve();
                } else {
                    deferred.reject("Error loading project structure: " + operation.error.errors.join(','));
                }
            },
            scope: this
        });

        return deferred;
    },
    initializeRecords: function(records){
        var hash = {},
            rootProjects = [];

        Ext.Array.each(records, function(r){
            hash[r.get('ObjectID')] = r.getData();
            hash[r.get('ObjectID')].children = [];
        });

        Ext.Object.each(hash, function(oid, projectData){
            projectData.__projectHierarchy = CA.technicalservices.userutilities.ProjectUtility._buildProjectHierarchy(oid,hash);
            var parentID = projectData.Parent && projectData.Parent.ObjectID || null;

            if (!parentID){
                rootProjects.push(projectData);
            } else {
                var parentModel = hash[parentID];
                parentModel.children.push(projectData);
            }
        });
        CA.technicalservices.userutilities.ProjectUtility.projectHash = hash;
        CA.technicalservices.userutilities.ProjectUtility.rootProjects = rootProjects;
    },
    getProjectTreeData: function(){
        //This is an attempt to deep clone the root projects structure.
        var newRootProjects = (JSON.parse(JSON.stringify(CA.technicalservices.userutilities.ProjectUtility.rootProjects)));
        return newRootProjects; //CA.technicalservices.userutilities.ProjectUtility.rootProjects;
    },
    _buildProjectHierarchy: function(projectID, projectHash){
        var parent = projectHash[projectID].Parent && projectHash[projectID].Parent.ObjectID || null;

        var projectHierarchy = [projectID];
        if (parent){
            do {
                projectHierarchy.unshift(parent);
                parent = projectHash[parent] &&
                    projectHash[parent].Parent &&
                    projectHash[parent].Parent.ObjectID || null;

            } while (parent);
        }
        return projectHierarchy;

    },
    assignPermissions: function(userOid, permission, projectOids, forceDowngrade){
        var deferred = Ext.create('Deft.Deferred');
        forceDowngrade = forceDowngrade || false;

        var rootProjectData = CA.technicalservices.userutilities.ProjectUtility.getRootProjectData(projectOids,
            CA.technicalservices.userutilities.ProjectUtility.projectHash);

        console.log('rootProjectData', rootProjectData);

        var promises = [],
            me = this;
        Ext.Array.each(rootProjectData, function(rpd){
            promises.push(function(){
                return CA.technicalservices.userutilities.ProjectUtility._updatePermissionRootProject(userOid,rpd.rootProjectOID,rpd.excludedProjectOIDs,permission,forceDowngrade);
            })
        });

        Deft.Chain.parallel(promises).then({
            success: function(results){
                deferred.resolve(results);
            }
        });

        return deferred.promise;
    },
    _updatePermissionRootProject: function(userObjectID, rootProjectObjectID, excludedProjectIDs, permission, forceDowngrade){

        console.log('_updatePermissionRootProject', userObjectID, rootProjectObjectID, excludedProjectIDs, permission, forceDowngrade);

        var deferred = Ext.create('Deft.Deferred');
        forceDowngrade = forceDowngrade || false;

        if (Ext.isArray(excludedProjectIDs)){
            excludedProjectIDs = excludedProjectIDs.join(',');
        }

        Ext.Ajax.request({
            url: '/slm/webservice/v2.0/projectpermission/bulkupdate',
            method: 'POST',
            params: {
                "userOID" : userObjectID,
                "rootProjectOID": rootProjectObjectID,
                "excludedRootProjectOIDs": excludedProjectIDs, //comma-delimited
                "permission": permission, //No Access, Viewer, Editor, or Project Admin.
                "forceDowngradePermissions": forceDowngrade
            },
            scope:this,
            success: function(response, options){
                console.log('success', response, options);
                var result = this._parseResult(response);
                result.user = userObjectID;
                deferred.resolve(result);
            },
            failure: function(response, options){
                console.log('failed', response, options);
                var result = this._parseResult(response);
                result.user = userObjectID;
                deferred.resolve(result);
            }
        });
        return deferred.promise;
    },
    _parseResult: function(response, options){
        var responseText = response && response.responseText,
            status = response.status,
            success = false;

        if (status === 200){
            var operationResult = Ext.JSON.decode(response.responseText);
            if (operationResult && operationResult.OperationResult && operationResult.OperationResult.Results){
                var results = operationResult.OperationResult.Results;
                if (results.length > 0){
                    responseText = results[0];
                    if (responseText === "Disabled"){
                        responseText = "This functionality is disabled for your subscription.";

                    } else {
                        success = true;
                    }
                }
            }
        }
        console.log('responseTest',responseText);
        return {success: success,
                message: responseText
        };
    },
    /**
     * getRootProjectData
     * Given an array of projects, this function takes the projects and splits them up into
     * the most efficient root structure with excluded project ids
     * excludedProjectIDs - excluded projects in the treenode
     * count - total count of projects affected
     * @param treeStore
     * @param matchFn
     * @returns {Array}
     */
    getRootProjectData: function(projects, projectHash){
        var data = [];

        Ext.Array.each(projects, function(p){
            var po = projectHash[p];
            if (!po.Parent || !Ext.Array.contains(projects, po.Parent.ObjectID)){
                data.push({
                    rootProjectOID: po.ObjectID,
                    excludedProjectOIDs: CA.technicalservices.userutilities.ProjectUtility.getExcludedProjects(po.children, projects)
                });
            }
        });
        return data;
    },
    getExcludedProjects: function(children, projects){
        var excludedProjects = [];
        Ext.Array.each(children, function(c){
            if (!Ext.Array.contains(projects, c.ObjectID)){
                excludedProjects.push(c.ObjectID);
            } else {
                excludedProjects = Ext.Array.merge(excludedProjects,
                CA.technicalservices.userutilities.ProjectUtility.getExcludedProjects(c.children, projects));
            }
        });
        return excludedProjects;
    },
    getPermission: function(permissionKey){
        return CA.technicalservices.userutilities.ProjectUtility.permissions[permissionKey] ||
            CA.technicalservices.userutilities.ProjectUtility.permissions.__permissionNoAccess;
    }
});