Ext.define('CA.technicalservices.userutilities.bulkmenu.AssignPermissions', {
    alias: 'widget.assignpermissionsbulkmenuitem',
    extend: 'Rally.ui.menu.bulk.MenuItem',

    config: {
//        onBeforeAction: function(){
////            console.log('onbeforeaction');
//        },

        text: 'Assign Permissions...',

        handler: function () {
            var dialog = Ext.create('CA.technicalservices.userutilities.dialog.AssignProjectPermissions',{});
            dialog.on('updated', this.assignPermissions, this);
        },
        predicate: function (records) {

            return _.every(records, function (record) {

                return record;
            });

        },

        assignPermissions: function(dlg, selectionCache){
            var successfulRecords = [],
                unsuccessfulRecords = [];

            console.log('assignPermissions', selectionCache);
            var promises = [];
            Ext.Array.each(this.records, function(r){
                var user = r.get('ObjectID');
                Ext.Object.each(selectionCache, function(permissionKey, projects){
                    var permission = CA.technicalservices.userutilities.ProjectUtility.getPermission(permissionKey);
                    promises.push(
                        function(){ return CA.technicalservices.userutilities.ProjectUtility.assignPermissions(user, permission,projects); });
                });
            });

            var records = this.records;
            console.log('promieses',promises.length, 'records',records);
            Deft.Chain.sequence(promises).then({
                success: function(results){
                    var idx = 0,
                        errorMessages = [];
                    Ext.Array.each(records, function(user){
                        var success = false;
                        Ext.Object.each(selectionCache, function(permissionKey, projects){
                            console.log('results', user.get('ObjectID'), permissionKey, results[idx][0]);
                            if (results[idx] && results[idx][0].success === true){
                                success = true;
                            } else {
                                if (!Ext.Array.contains(errorMessages, results[idx][0].message)){
                                    errorMessages.push(results[idx][0].message);
                                }
                            }
                            idx++;

                        });
                        if (!success){
                            unsuccessfulRecords.push(user);
                        } else {
                            successfulRecords.push(user);
                        }

                    });
                    console.log('records', successfulRecords, unsuccessfulRecords);
                    if (successfulRecords.length > 0){
                        this.onSuccess(successfulRecords, unsuccessfulRecords,null,errorMessages);
                    } else {
                        if (errorMessages.length > 0){
                            console.log('errormessages', errorMessages);
                            Rally.ui.notify.Notifier.showError({message: "0 Users were updated:<br/>" + errorMessages.join('<br/>')});
                        }
                    }
                    //this.onActionComplete(successfulRecords, unsuccessfulRecords);
                    if (errorMessages.length > 0){
                        console.log('errormessages', errorMessages);
                        Rally.ui.notify.Notifier.showError({message: errorMessages.join(',')});
                    }

                },
                scope: this
            });


        },
        onSuccess: function (successfulRecords, unsuccessfulRecords, args, errorMessage) {

            var message = successfulRecords.length + (successfulRecords.length === 1 ? ' user has been updated' : ' users have been updated');

            if(successfulRecords.length === this.records.length) {
                Rally.ui.notify.Notifier.show({
                    message: message + '.'
                });
            } else {
                Rally.ui.notify.Notifier.showWarning({
                    message: message + ', but ' + unsuccessfulRecords.length + ' failed: ' + errorMessage
                });
            }

            Ext.callback(this.onActionComplete, null, [successfulRecords, unsuccessfulRecords]);
        }
    }
});