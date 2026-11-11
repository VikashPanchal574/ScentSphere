public with sharing class CollectionsController {

    @AuraEnabled(cacheable=true)
    public static List<Perfume__c> getPerfumesByCategory(String category) {

        // All categories selected
        if (String.isBlank(category) || category == 'All') {

            return [
                SELECT Id,
                       Product_Name__c,
                       Brand__c,
                       Category__c,
                       Description__c,
                       Price__c,
                       Size__c,
                       Product_Image_URL__c,
                       Featured_Product__c
                FROM Perfume__c
                WHERE Active__c = true
                WITH USER_MODE
                ORDER BY Featured_Product__c DESC, Product_Name__c ASC
                LIMIT 100
            ];
        }

        // Specific category selected
        return [
            SELECT Id,
                   Product_Name__c,
                   Brand__c,
                   Category__c,
                   Description__c,
                   Price__c,
                   Size__c,
                   Product_Image_URL__c,
                   Featured_Product__c
            FROM Perfume__c
            WHERE Active__c = true
            AND Category__c = :category
            WITH USER_MODE
            ORDER BY Featured_Product__c DESC, Product_Name__c ASC
            LIMIT 100
        ];
    }
}