@IsTest
private class PerfumeSearchControllerTest {

    private static User createAdminUser(String suffix) {
        Profile adminProfile = [
            SELECT Id
            FROM Profile
            WHERE Name = 'System Administrator'
            LIMIT 1
        ];
        String uniqueValue = String.valueOf(DateTime.now().getTime()) + suffix;
        User admin = new User(
            Alias = 'sr' + suffix,
            Email = 'perfumesearchtest' + uniqueValue + '@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'SearchTester' + suffix,
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            TimeZoneSidKey = 'Asia/Kolkata',
            ProfileId = adminProfile.Id,
            UserName = 'perfumesearchtest' + uniqueValue + '@example.com'
        );
        insert admin;
        return admin;
    }

    @TestSetup
    static void setupPerfumes() {
        insert new List<Perfume__c>{
                new Perfume__c(
                    Product_Name__c = 'Velvet Bloom',
                    Brand__c = 'ScentSphere Originals',
                    Category__c = 'Floral',
                    Gender__c = 'Women',
                    Price__c = 2999,
                    Size__c = '100 ml',
                    Description__c = 'Featured floral perfume',
                    Product_Image_URL__c = 'https://example.com/velvet.jpg',
                    Stock_Quantity__c = 8,
                    Active__c = true,
                    Featured_Product__c = true
                ),
                new Perfume__c(
                    Product_Name__c = 'Amber Echo',
                    Brand__c = 'Dior',
                    Category__c = 'Woody',
                    Gender__c = 'Men',
                    Price__c = 5499,
                    Size__c = '50 ml',
                    Description__c = 'A warm woody profile',
                    Product_Image_URL__c = 'https://example.com/amber.jpg',
                    Stock_Quantity__c = 5,
                    Active__c = true,
                    Featured_Product__c = true
                ),
                new Perfume__c(
                    Product_Name__c = 'Gucci Bloom',
                    Brand__c = 'Gucci',
                    Category__c = 'Floral',
                    Gender__c = 'Women',
                    Price__c = 3999,
                    Size__c = '50 ml',
                    Description__c = 'Active Gucci floral scent',
                    Product_Image_URL__c = 'https://example.com/gucci.jpg',
                    Stock_Quantity__c = 11,
                    Active__c = true,
                    Featured_Product__c = false
                ),
                new Perfume__c(
                    Product_Name__c = 'Ocean Mist',
                    Brand__c = 'Tom Ford',
                    Category__c = 'Fresh',
                    Gender__c = 'Women',
                    Price__c = 6999,
                    Size__c = '100 ml',
                    Description__c = 'Fresh ocean-inspired fragrance',
                    Product_Image_URL__c = 'https://example.com/ocean.jpg',
                    Stock_Quantity__c = 6,
                    Active__c = true,
                    Featured_Product__c = false
                ),
                new Perfume__c(
                    Product_Name__c = 'Midnight Noir',
                    Brand__c = 'Gucci',
                    Category__c = 'Oriental',
                    Gender__c = 'Men',
                    Price__c = 4500,
                    Size__c = '50 ml',
                    Description__c = 'Inactive Gucci perfume',
                    Product_Image_URL__c = 'https://example.com/noir.jpg',
                    Stock_Quantity__c = 2,
                    Active__c = false,
                    Featured_Product__c = true
                )
        };
    }

    @IsTest
    static void testGetSuggestionsReturnsFeaturedProductsWhenSearchIsBlank() {
        User admin = createAdminUser('a1');
        List<PerfumeSearchController.SearchSuggestion> suggestions;

        Test.startTest();
        System.runAs(admin) {
            suggestions = PerfumeSearchController.getSuggestions('   ');
        }
        Test.stopTest();

        System.assertEquals(2, suggestions.size(), 'Blank searches should return featured active products.');

        Set<String> productNames = new Set<String>();
        for (PerfumeSearchController.SearchSuggestion suggestion : suggestions) {
            productNames.add(suggestion.productName);
            System.assertNotEquals(null, suggestion.id);
            System.assertNotEquals(null, suggestion.productName);
            System.assertNotEquals(null, suggestion.brand);
            System.assertNotEquals(null, suggestion.size);
            System.assertNotEquals(null, suggestion.imageUrl);
            System.assertNotEquals(null, suggestion.price);
        }

        System.assert(productNames.contains('Velvet Bloom'));
        System.assert(productNames.contains('Amber Echo'));
        System.assert(!productNames.contains('Gucci Bloom'));
        System.assert(!productNames.contains('Midnight Noir'));
    }

    @IsTest
    static void testGetSuggestionsMatchesProductBrandAndCategoryAcrossActiveProducts() {
        User admin = createAdminUser('a2');
        List<PerfumeSearchController.SearchSuggestion> byProductName;
        List<PerfumeSearchController.SearchSuggestion> byBrand;
        List<PerfumeSearchController.SearchSuggestion> byCategory;

        System.runAs(admin) {
            byProductName = PerfumeSearchController.getSuggestions('Gucci');
            byBrand = PerfumeSearchController.getSuggestions('Gucci Bloom');
            byCategory = PerfumeSearchController.getSuggestions('Floral');
        }

        System.assertEquals(1, byProductName.size(), 'Gucci should match the active Gucci brand.');
        System.assertEquals('Gucci Bloom', byProductName[0].productName);
        System.assertEquals('Gucci', byProductName[0].brand);

        System.assertEquals(1, byBrand.size(), 'The exact product name should match the active product.');
        System.assertEquals('Gucci Bloom', byBrand[0].productName);

        System.assertEquals(2, byCategory.size(), 'Floral category should match all active floral products.');
        Set<String> categoryMatchNames = new Set<String>();
        for (PerfumeSearchController.SearchSuggestion suggestion : byCategory) {
            categoryMatchNames.add(suggestion.productName);
        }
        System.assert(categoryMatchNames.contains('Velvet Bloom'));
        System.assert(categoryMatchNames.contains('Gucci Bloom'));
        System.assert(!categoryMatchNames.contains('Midnight Noir'));
    }

    @IsTest
    static void testGetSuggestionsHandlesVeryLongSearchTerms() {
        User admin = createAdminUser('a3');
        String longTerm = 'A'.repeat(101);
        List<PerfumeSearchController.SearchSuggestion> suggestions;
        Test.startTest();
        System.runAs(admin) {
            suggestions = PerfumeSearchController.getSuggestions(longTerm);
        }
        Test.stopTest();

        System.assertEquals(
            0,
            suggestions.size(),
            'A long search term with no matching product should return no suggestions.'
        );
    }
}
