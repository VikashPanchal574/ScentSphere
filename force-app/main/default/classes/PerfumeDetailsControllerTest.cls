@IsTest
private class PerfumeDetailsControllerTest {

    private static User createAdminUser(String suffix) {
        Profile adminProfile = [
            SELECT Id
            FROM Profile
            WHERE PermissionsModifyAllData = true
            LIMIT 1
        ];
        String uniqueValue = String.valueOf(DateTime.now().getTime()) + suffix;
        User admin = new User(
            Alias = 'det' + suffix,
            Email = 'perfumedetailstest' + uniqueValue + '@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'DetailsTester' + suffix,
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            TimeZoneSidKey = 'Asia/Kolkata',
            ProfileId = adminProfile.Id,
            UserName = 'perfumedetailstest' + uniqueValue + '@example.com'
        );
        insert admin;
        return admin;
    }

    private static Perfume__c buildPerfume(
        String productName,
        String category,
        Boolean active,
        Boolean featured,
        String giftCollection
    ) {
        return new Perfume__c(
            Product_Name__c = productName,
            Brand__c = 'Dior',
            Category__c = category,
            Gender__c = 'Women',
            Price__c = 2999,
            Size__c = '100 ml',
            Description__c = 'Perfume details test description',
            Fragrance_Notes__c = 'Jasmine and rose',
            Product_Image_URL__c = 'https://example.com/details.jpg',
            Stock_Quantity__c = 15,
            Active__c = active,
            Featured_Product__c = featured,
            Gift_Collection__c = giftCollection
        );
    }

    @TestSetup
    static void setupPerfumes() {
        insert new List<Perfume__c>{
            buildPerfume('Details Current', 'Floral', true, true, null),
            buildPerfume('Related Floral 1', 'Floral', true, false, null),
            buildPerfume('Related Floral 2', 'Floral', true, false, null),
            buildPerfume('Related Floral 3', 'Floral', true, false, null),
            buildPerfume('Related Floral 4', 'Floral', true, false, null),
            buildPerfume('Related Floral 5', 'Floral', true, false, null),
            buildPerfume(
                'Related Gift',
                'Floral',
                true,
                false,
                'Gifts for Her'
            ),
            buildPerfume('Related Inactive', 'Floral', false, false, null),
            buildPerfume('Blank Category', null, true, false, null),
            buildPerfume('No Related Products', 'Citrus', true, false, null),
            buildPerfume('Unavailable Product', 'Floral', false, false, null)
        };
    }

    private static Id getPerfumeId(String productName) {
        return [
            SELECT Id
            FROM Perfume__c
            WHERE Product_Name__c = :productName
            LIMIT 1
        ].Id;
    }

    private static void assertDetailsThrows(Id perfumeId) {
        Boolean exceptionThrown = false;
        try {
            PerfumeDetailsController.getPerfumeDetails(perfumeId);
        } catch (AuraHandledException e) {
            exceptionThrown = true;
        }
        System.assert(exceptionThrown, 'Expected an AuraHandledException.');
    }

    private static void assertRelatedThrows(Id perfumeId) {
        Boolean exceptionThrown = false;
        try {
            PerfumeDetailsController.getRelatedPerfumes(perfumeId, 1);
        } catch (AuraHandledException e) {
            exceptionThrown = true;
        }
        System.assert(exceptionThrown, 'Expected an AuraHandledException.');
    }

    @IsTest
    static void testGetPerfumeDetailsReturnsActiveProduct() {
        User admin = createAdminUser('a1');
        Id perfumeId = getPerfumeId('Details Current');

        Perfume__c result;
        Test.startTest();
        System.runAs(admin) {
            result = PerfumeDetailsController.getPerfumeDetails(perfumeId);
        }
        Test.stopTest();

        System.assertEquals(perfumeId, result.Id);
        System.assertNotEquals(null, result.Name);
        System.assertEquals('Details Current', result.Product_Name__c);
        System.assertEquals('Dior', result.Brand__c);
        System.assertEquals('Floral', result.Category__c);
        System.assertEquals('Women', result.Gender__c);
        System.assertEquals(2999, result.Price__c);
        System.assertEquals('100 ml', result.Size__c);
        System.assertEquals(
            'Perfume details test description',
            result.Description__c
        );
        System.assertEquals('Jasmine and rose', result.Fragrance_Notes__c);
        System.assertEquals(
            'https://example.com/details.jpg',
            result.Product_Image_URL__c
        );
        System.assertEquals(15, result.Stock_Quantity__c);
        System.assertEquals(true, result.Active__c);
    }

    @IsTest
    static void testGetPerfumeDetailsRequiresId() {
        assertDetailsThrows(null);
    }

    @IsTest
    static void testGetPerfumeDetailsRejectsInactiveProduct() {
        User admin = createAdminUser('a2');
        Id perfumeId = getPerfumeId('Unavailable Product');

        System.runAs(admin) {
            assertDetailsThrows(perfumeId);
        }
    }

    @IsTest
    static void testGetRelatedPerfumesRequiresId() {
        assertRelatedThrows(null);
    }

    @IsTest
    static void testGetRelatedPerfumesPaginatesAndClampsPageNumber() {
        User admin = createAdminUser('a3');
        Id perfumeId = getPerfumeId('Details Current');

        PerfumeDetailsController.RelatedPerfumesResponse firstPage;
        PerfumeDetailsController.RelatedPerfumesResponse secondPage;
        PerfumeDetailsController.RelatedPerfumesResponse clampedPage;
        PerfumeDetailsController.RelatedPerfumesResponse defaultPage;
        Test.startTest();
        System.runAs(admin) {
            firstPage = PerfumeDetailsController.getRelatedPerfumes(perfumeId, 1);
            secondPage = PerfumeDetailsController.getRelatedPerfumes(perfumeId, 2);
            clampedPage = PerfumeDetailsController.getRelatedPerfumes(perfumeId, 99);
            defaultPage = PerfumeDetailsController.getRelatedPerfumes(perfumeId, 0);
        }
        Test.stopTest();

        System.assertEquals(5, firstPage.totalCount);
        System.assertEquals(2, firstPage.totalPages);
        System.assertEquals(1, firstPage.pageNumber);
        System.assertEquals(4, firstPage.products.size());
        System.assertEquals(1, secondPage.products.size());
        System.assertEquals(2, secondPage.pageNumber);
        System.assertEquals(2, clampedPage.pageNumber);
        System.assertEquals(
            secondPage.products[0].Id,
            clampedPage.products[0].Id
        );
        System.assertEquals(1, defaultPage.pageNumber);
        System.assertEquals(4, defaultPage.products.size());

        Set<Id> relatedIds = new Set<Id>();
        for (Perfume__c perfume : firstPage.products) {
            relatedIds.add(perfume.Id);
            System.assertEquals('Floral', perfume.Category__c);
            System.assertEquals(true, perfume.Active__c);
        }
        System.assertEquals(4, relatedIds.size());
        for (Perfume__c perfume : secondPage.products) {
            System.assert(!relatedIds.contains(perfume.Id));
            System.assertNotEquals(perfumeId, perfume.Id);
        }
    }

    @IsTest
    static void testGetRelatedPerfumesReturnsEmptyForUnavailableOrBlankCategory() {
        User admin = createAdminUser('a4');
        Id inactiveId = getPerfumeId('Unavailable Product');
        Id blankCategoryId = getPerfumeId('Blank Category');

        PerfumeDetailsController.RelatedPerfumesResponse inactiveResult;
        PerfumeDetailsController.RelatedPerfumesResponse blankCategoryResult;
        System.runAs(admin) {
            inactiveResult = PerfumeDetailsController.getRelatedPerfumes(
                inactiveId,
                1
            );
            blankCategoryResult = PerfumeDetailsController.getRelatedPerfumes(
                blankCategoryId,
                1
            );
        }

        System.assertEquals(0, inactiveResult.totalCount);
        System.assertEquals(0, inactiveResult.totalPages);
        System.assertEquals(0, inactiveResult.products.size());
        System.assertEquals(0, blankCategoryResult.totalCount);
        System.assertEquals(0, blankCategoryResult.totalPages);
        System.assertEquals(0, blankCategoryResult.products.size());
    }

    @IsTest
    static void testGetRelatedPerfumesReturnsEmptyWhenNoRelatedProducts() {
        User admin = createAdminUser('a5');
        Id perfumeId = getPerfumeId('No Related Products');

        PerfumeDetailsController.RelatedPerfumesResponse result;
        System.runAs(admin) {
            result = PerfumeDetailsController.getRelatedPerfumes(perfumeId, 1);
        }

        System.assertEquals(0, result.totalCount);
        System.assertEquals(0, result.totalPages);
        System.assertEquals(0, result.products.size());
    }
}
