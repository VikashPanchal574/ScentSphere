
public with sharing class FeaturedFragrancesController {

    public class FeaturedPerfume {

        @AuraEnabled public Id Id { get; set; }
        @AuraEnabled public String Name { get; set; }
        @AuraEnabled public String productName { get; set; }
        @AuraEnabled public String brand { get; set; }
        @AuraEnabled public String category { get; set; }
        @AuraEnabled public Decimal price { get; set; }
        @AuraEnabled public String size { get; set; }
        @AuraEnabled public String description { get; set; }
        @AuraEnabled public String imageUrl { get; set; }
        @AuraEnabled public Decimal stockQuantity { get; set; }

        public FeaturedPerfume(Perfume__c perfume) {

            Id = perfume.Id;
            Name = perfume.Name;
            productName = perfume.Product_Name__c;
            brand = perfume.Brand__c;
            category = perfume.Category__c;
            price = perfume.Price__c;
            size = perfume.Size__c;
            description = perfume.Description__c;
            imageUrl = perfume.Product_Image_URL__c;
            stockQuantity = perfume.Stock_Quantity__c;
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<FeaturedPerfume> getFeaturedPerfumes() {

        try {

            List<Perfume__c> perfumes = [
                SELECT Id,
                       Name,
                       Product_Name__c,
                       Brand__c,
                       Category__c,
                       Price__c,
                       Size__c,
                       Description__c,
                       Product_Image_URL__c,
                       Stock_Quantity__c
                FROM Perfume__c
                WHERE Active__c = true
                AND Featured_Product__c = true
                WITH USER_MODE
                ORDER BY CreatedDate DESC
                LIMIT 2000
            ];

            List<FeaturedPerfume> results =
                new List<FeaturedPerfume>();

            for (Perfume__c perfume : perfumes) {
                results.add(
                    new FeaturedPerfume(perfume)
                );
            }

            return results;

        } catch (Exception e) {

            System.debug(
                'Featured Fragrances Error: ' +
                e.getMessage()
            );

            throw new AuraHandledException(
                'Unable to load featured fragrances. Please try again.'
            );
        }
    }
}
