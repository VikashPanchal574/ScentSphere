
public with sharing class PerfumeDetailsController {

    @AuraEnabled(cacheable=true)
    public static Perfume__c getPerfumeDetails(Id perfumeId) {

        if (perfumeId == null) {
            throw new AuraHandledException(
                'Perfume ID is required.'
            );
        }

        try {
            List<Perfume__c> perfumes = [
                SELECT Id,
                       Name,
                       Product_Name__c,
                       Brand__c,
                       Category__c,
                       Gender__c,
                       Price__c,
                       Size__c,
                       Description__c,
                       Fragrance_Notes__c,
                       Product_Image_URL__c,
                       Stock_Quantity__c,
                       Active__c
                FROM Perfume__c
                WHERE Id = :perfumeId
                AND Active__c = true
                WITH USER_MODE
                LIMIT 1
            ];

            if (perfumes.isEmpty()) {
                throw new AuraHandledException(
                    'Perfume not found or unavailable.'
                );
            }

            return perfumes[0];

        } catch (AuraHandledException e) {
            throw e;

        } catch (Exception e) {
            throw new AuraHandledException(
                'Unable to load perfume details.'
            );
        }
    }
}
