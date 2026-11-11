@IsTest
private class PerfumeImageServiceTest {

    // If this insert fails with a "required field" or validation error,
    // add that field here (the Perfume__c setup was not visible to me).
    private static Perfume__c createPerfume(String name) {
        Perfume__c perfume = new Perfume__c(
            Product_Name__c = name,
            Price__c = 1999,
            Stock_Quantity__c = 10,
            Active__c = true
        );
        insert perfume;
        return perfume;
    }

    private static ContentVersion uploadFile(
        Id parentId,
        String title,
        String extension
    ) {
        ContentVersion version = new ContentVersion(
            Title = title,
            PathOnClient = title + '.' + extension,
            VersionData = Blob.valueOf('test-' + title),
            FirstPublishLocationId = parentId
        );
        insert version;
        return version;
    }

    private static List<ContentDistribution> distributionsFor(Id versionId) {
        return [
            SELECT Id, ContentDownloadUrl
            FROM ContentDistribution
            WHERE ContentVersionId = :versionId
        ];
    }

    @IsTest
    static void imageOnPerfume_createsPublicLinkAndFillsUrlField() {
        Perfume__c perfume = createPerfume('Test Oud');

        Test.startTest();
        ContentVersion version = uploadFile(perfume.Id, 'oud-front', 'png');
        Test.stopTest();

        List<ContentDistribution> distributions = distributionsFor(version.Id);
        System.assertEquals(1, distributions.size(),
            'One public link should be created for the image.');

        Perfume__c reloaded = [
            SELECT Product_Image_URL__c FROM Perfume__c WHERE Id = :perfume.Id
        ];
        System.assertEquals(
            distributions[0].ContentDownloadUrl,
            reloaded.Product_Image_URL__c,
            'The Perfume should store the generated download URL.'
        );
    }

    @IsTest
    static void nonImageFile_isIgnored() {
        Perfume__c perfume = createPerfume('Test Musk');

        Test.startTest();
        ContentVersion version = uploadFile(perfume.Id, 'spec-sheet', 'pdf');
        Test.stopTest();

        System.assertEquals(0, distributionsFor(version.Id).size(),
            'A PDF must never get a public link.');

        Perfume__c reloaded = [
            SELECT Product_Image_URL__c FROM Perfume__c WHERE Id = :perfume.Id
        ];
        System.assert(String.isBlank(reloaded.Product_Image_URL__c));
    }

    @IsTest
    static void fileOnAnotherObject_isIgnored() {
        Account account = new Account(Name = 'Not A Perfume');
        insert account;

        Test.startTest();
        ContentVersion version = uploadFile(account.Id, 'logo', 'png');
        Test.stopTest();

        System.assertEquals(0, distributionsFor(version.Id).size(),
            'Files on other records must never get a public link.');
    }

    @IsTest
    static void secondImage_replacesFirstOnThePerfume() {
        Perfume__c perfume = createPerfume('Test Amber');

        Test.startTest();
        uploadFile(perfume.Id, 'amber-one', 'jpg');
        ContentVersion second = uploadFile(perfume.Id, 'amber-two', 'jpg');
        Test.stopTest();

        List<ContentDistribution> distributions = distributionsFor(second.Id);
        System.assertEquals(1, distributions.size());

        Perfume__c reloaded = [
            SELECT Product_Image_URL__c FROM Perfume__c WHERE Id = :perfume.Id
        ];
        System.assertEquals(
            distributions[0].ContentDownloadUrl,
            reloaded.Product_Image_URL__c,
            'The newest image should be the one stored on the Perfume.'
        );
    }

    @IsTest
    static void runningTwice_doesNotCreateDuplicateLinks() {
        Perfume__c perfume = createPerfume('Test Vanilla');
        ContentVersion version = uploadFile(perfume.Id, 'vanilla', 'png');

        List<ContentDocumentLink> links = [
            SELECT Id, LinkedEntityId, ContentDocumentId
            FROM ContentDocumentLink
            WHERE LinkedEntityId = :perfume.Id
        ];

        Test.startTest();
        PerfumeImageService.handleNewLinks(links);
        Test.stopTest();

        System.assertEquals(1, distributionsFor(version.Id).size(),
            'Re-processing the same file must not create a second public link.');
    }
}