
public with sharing class CollectionsController {

    // Normal Collections: Gift perfumes excluded
    @AuraEnabled(cacheable=true)
    public static List<Perfume__c> getPerfumesByCategory(String category) {

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
                       Featured_Product__c,
                       Stock_Quantity__c
                FROM Perfume__c
                WHERE Active__c = true
                AND Gift_Collection__c = null
                WITH USER_MODE
                ORDER BY Featured_Product__c DESC, Product_Name__c ASC
                LIMIT 100
            ];
        }

        return [
            SELECT Id,
                   Product_Name__c,
                   Brand__c,
                   Category__c,
                   Description__c,
                   Price__c,
                   Size__c,
                   Product_Image_URL__c,
                   Featured_Product__c,
                   Stock_Quantity__c
            FROM Perfume__c
            WHERE Active__c = true
            AND Category__c = :category
            AND Gift_Collection__c = null
            WITH USER_MODE
            ORDER BY Featured_Product__c DESC, Product_Name__c ASC
            LIMIT 100
        ];
    }

    // Gift page: only specially assigned gift perfumes
    @AuraEnabled(cacheable=true)
    public static List<Perfume__c> getGiftPerfumes(String giftCollection) {

        if (String.isBlank(giftCollection) || giftCollection == 'All') {
            return [
                SELECT Id,
                       Product_Name__c,
                       Brand__c,
                       Category__c,
                       Description__c,
                       Price__c,
                       Size__c,
                       Product_Image_URL__c,
                       Gift_Collection__c,
                       Stock_Quantity__c
                FROM Perfume__c
                WHERE Active__c = true
                AND Gift_Collection__c != null
                WITH USER_MODE
                ORDER BY Product_Name__c ASC
                LIMIT 100
            ];
        }

        return [
            SELECT Id,
                   Product_Name__c,
                   Brand__c,
                   Category__c,
                   Description__c,
                   Price__c,
                   Size__c,
                   Product_Image_URL__c,
                   Gift_Collection__c,
                   Stock_Quantity__c
            FROM Perfume__c
            WHERE Active__c = true
            AND Gift_Collection__c = :giftCollection
            WITH USER_MODE
            ORDER BY Product_Name__c ASC
            LIMIT 100
        ];
    }
}
