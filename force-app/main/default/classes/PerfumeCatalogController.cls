
public with sharing class PerfumeCatalogController {

    @AuraEnabled(cacheable=true)
    public static List<Perfume__c> getActivePerfumes() {

        try {
            return [
                SELECT Id,
                       Name,
                       Product_Name__c,
                       Brand__c,
                       Category__c,
                       Gender__c,
                       Price__c,
                       Size__c,
                       Description__c,
                       Product_Image_URL__c,
                       Stock_Quantity__c,
                       Featured_Product__c
                FROM Perfume__c
                WHERE Active__c = true
                AND Gift_Collection__c = null
                WITH USER_MODE
                ORDER BY CreatedDate DESC
                LIMIT 200
            ];

        } catch (Exception e) {
            throw new AuraHandledException(
                'Unable to load perfumes. Please try again.'
            );
        }
    }
}
