module.exports = function (context, req) {
    context.log.verbose("started");
    var eventPayload = require('zealit')(req.body.data); //helps nested lookups by turning undefined gets to exceptions
    context.log.verbose(eventPayload);

    //Apply filter that is not configurable from the alert creation
    context.log.verbose("checking additional filter");
    if (!shouldRespondToEvent(eventPayload)) {
        context.log.verbose("event was filtered out");
        end(200, "skipped", "verbose");
        return;
    }

    context.log.verbose("extracting mandatory data from event");
    try {
        var rgName = eventPayload.context.activityLog.resourceGroupName;
        var userName = eventPayload.context.activityLog.caller;
    }
    catch (err) {
        context.log.verbose("failed to extract mandatory data from event");
        end(400, "error extracting data from body", "error");
        return;
    }

    context.log.verbose("getting environment settings");
    try {
        var subscriptionId = process.env["APPSETTING_subscriptionId"];
        var appId = process.env["APPSETTING_appId"];
        var appSecret = process.env["APPSETTING_appSecret"];
        var tenantId = process.env["APPSETTING_tenantId"];
        var tagName = process.env["APPSETTING_tagName"];
    }
    catch (err) {
        context.log.verbose("failed to get environment settings");
        end(500, "error reading app settings", error);
        return;
    }

    var rest = require('ms-rest-azure');
    var rm = require("azure-arm-resource");
    Promise = require('bluebird');
    Promise.config({
        cancellation: true
    });
    var client;

    context.log.verbose("authenticating");
    var p = rest.loginWithServicePrincipalSecret(appId, appSecret, tenantId)
    .catch(() => {
        context.log.verbose("error authenticating");
        end(500, "error authenticating", "error");
        p.cancel();    
    }).then(creds => {
        client = new rm.ResourceManagementClient(creds, subscriptionId);
        context.log.verbose("getting resource group metadata");
        return client.resourceGroups.get(rgName);
    }).catch(() => {
        context.log.verbose("error getting rg metadata");
        end(500, "error getting rg metadata", "error");
        p.cancel();        
    }).then(rgData => {
        context.log.verbose("checking if tag already exists");
        if (rgData.tags && rgData.tags[tagName]) {
            context.log.verbose("tag was found in rg metadata");
            return Promise.reject();
        }
        else {
            return rgData;
        }
    }).catch(() => {
        context.log.verbose("tag already exists, skipping");
        end(200, "skipped", "verbose");
        p.cancel();            
    }).then((rgData) => {
        context.log.verbose("constructing rg with tags payload");
        rgData.tags = rgData.tags || {};
        rgData.tags[tagName] = userName;
        context.log.verbose("rg with tags payload is: ", JSON.stringify(rgData));
        context.log.verbose("updating rg (applying tag)");
        client.resourceGroups.createOrUpdate(rgName, rgData);
    }).catch(err => {
        context.log.verbose("error applying tag");
        end(500, "error applying tag", "error");
        p.cancel();            
    }).then(() => {
        context.log.verbose("rg was tagged");
        end(200);
    }).catch(err => { //never reached.. remove?
        context.log.verbose("unknown error caught | " + JSON.stringify(err));
        end(500, "unknown error caught | " + JSON.stringify(err), "error");
    }); //finally?
    
    function shouldRespondToEvent(eventPayload) {
        try {
            var subStatus = eventPayload.context.activityLog.subStatus;
        }
        catch (err) {
            return false;
        }

        if (subStatus == "Created") {
            return true;
        }
        return false;
    }

    function end(httpStatus, message, level) {
        if (level == 'error') {
            context.log.error(message);
        }
        if (level == 'verbose') {
            context.log.verbose(message);
        }
        context.res = {
            status: httpStatus,
            body: message
        };
        context.done();
    }
};

