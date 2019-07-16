Automatically tag Azure resource groups with the user who created them.  
For more background on the problem, and alternative solutions, see here: http://blog.itaysk.com/2017/05/25/determine-who-created-resources-in-azure.

## FAQ

### Why tag resource groups, and not individual resources?
Azure doesn't have a unified API to tag resources: All operations in Azure are segregated into 'Resource Providers', each is a micro-service style API with it's own schema, interface *and versioning*. Tagging is a Resource Provider specific operation (that just happens to exist and have the same signature across all resource providers). This means that in order to tag a resource, you have to know what kind of resource you are tagging, and use the specific version that this resource provider expects. This makes tagging resources hard and cumbersome. 

### What if I really need resource level tagging?
It is possible to implement resource level tagging - you would have to indentify the resource type, call the providers API, get a list of supported versions, and call the generic resource api using the latest version. If your really need it - open an issue and I'll consider to implement this (or do it yourself and send a PR).

### Created vs Modified
The business logic in this POC implements a 'Created by' semantics. that is why we are only looking at resource group *creation* activities.
If you need 'Modified by' semantics, you can change the code to look at more kinds of events, and update the tag with recent users.
If you do that, take care not to find yourself in an infinite loop, where updating the tag value generates another alert for which you respond.

### Why node.js?
I wanted to use PowerShell, but Azure Function's support for PowerShell is not perfect, and is [perticulary bad for Azure PowerShell Module](https://github.com/Azure/Azure-Functions/issues/124). So I choose one of the "first class citizen" languages - node.js.

## Technical Overview
- Setup Alerts in Azure that look for resource group creation activities.
- Respond with web hook call to Azure Function.
- Azure Function that tags resource groups with the user who initiated the request.

## Setup

### Create or locate authentication settings
Create or locate a service principle with permissions on your subscription: https://docs.microsoft.com/en-us/azure/azure-resource-manager/resource-group-create-service-principal-portal.

Make note of your:
- SPN Id
- SPN Key
- AAD tenant Id

### Azure Function
- Deploy the code to an HTTP node.js Azure Function https://docs.microsoft.com/en-us/azure/azure-functions/functions-create-first-azure-function.
- Don't forget to restore packeages (`npm install`) if not done automatically by CD.
- Configure the application settings with the values obtained in previous step. the names for the settings are:
    - `appId`
    - `appSecret`
    - `tenantId`
    - `tagName`
- Make note of the function url.
- The subscriptionId will be retrieved from the WebHook data

### Configure Azure Activity Log Alerts
See here for an overview: https://docs.microsoft.com/en-us/azure/monitoring-and-diagnostics/monitoring-activity-log-alerts
Set the filter to: 
Filter | Value
--- | ---
Event category | Administrative
Resource Type | All
Resource | All
Operation name | Create Resource Group
Level | Informational
Status | Succeeded
Event initiated by | (leave blank)

### Configure Action Group
Use the Function url from previous step as the WebHook target in the action group of the alert.
