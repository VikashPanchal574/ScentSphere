
public with sharing class PerfumeSearchController {

    public class SearchSuggestion {
        @AuraEnabled public Id id { get; set; }
        @AuraEnabled public String productName { get; set; }
        @AuraEnabled public String brand { get; set; }
        @AuraEnabled public String size { get; set; }
        @AuraEnabled public Decimal price { get; set; }
        @AuraEnabled public String imageUrl { get; set; }

        public SearchSuggestion(Perfume__c perfume) {
            id = perfume.Id;
            productName = perfume.Product_Name__c;
            brand = perfume.Brand__c;
            size = perfume.Size__c;
            price = perfume.Price__c;
            imageUrl = perfume.Product_Image_URL__c;
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<SearchSuggestion> getSuggestions(
        String searchTerm
    ) {
        String keyword = String.isBlank(searchTerm)
            ? ''
            : searchTerm.trim();

        if (keyword.length() > 100) {
            keyword = keyword.substring(0, 100);
        }

        List<Perfume__c> perfumes;

        if (String.isBlank(keyword)) {
            // Suggestions immediately on search focus
            perfumes = [
                SELECT Id, Product_Name__c, Brand__c,
                       Size__c, Price__c,
                       Product_Image_URL__c
                FROM Perfume__c
                WHERE Active__c = true
                AND Featured_Product__c = true
                WITH USER_MODE
                ORDER BY CreatedDate DESC
                LIMIT 6
            ];
        } else {
            String pattern = '%' + keyword + '%';

            perfumes = [
                SELECT Id, Product_Name__c, Brand__c,
                       Size__c, Price__c,
                       Product_Image_URL__c
                FROM Perfume__c
                WHERE Active__c = true
                AND (
                    Product_Name__c LIKE :pattern
                    OR Brand__c LIKE :pattern
                    OR Category__c LIKE :pattern
                )
                WITH USER_MODE
                ORDER BY CreatedDate DESC
                LIMIT 6
            ];
        }

        List<SearchSuggestion> suggestions =
            new List<SearchSuggestion>();

        for (Perfume__c perfume : perfumes) {
            suggestions.add(new SearchSuggestion(perfume));
        }

        return suggestions;
    }
}
