public with sharing class PerfumeImageService {

    // true  = the public link always shows the newest version of the file,
    //         so "Upload New Version" updates the storefront image too.
    // false = the link keeps showing the version that was shared (old script behaviour).
    private static final Boolean LINK_LATEST_VERSION = true;

    // Only these file types ever get a public link. SVG is excluded on purpose.
    private static final Set<String> IMAGE_EXTENSIONS =
        new Set<String>{ 'png', 'jpg', 'jpeg', 'gif', 'webp' };

    // Called by PerfumeImageLinkTrigger (after insert on ContentDocumentLink).
    // Never throws: a problem here must not block the admin's file upload.
    public static void handleNewLinks(List<ContentDocumentLink> newLinks) {
        try {
            processLinks(newLinks);
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR,
                'PerfumeImageService error'
                + ' | Type=' + e.getTypeName()
                + ' | Message=' + e.getMessage()
                + ' | Line=' + e.getLineNumber()
                + ' | Stack=' + e.getStackTraceString());
        }
    }

    private static void processLinks(List<ContentDocumentLink> newLinks) {

        String perfumePrefix =
            Perfume__c.SObjectType.getDescribe().getKeyPrefix();

        // 1. Keep only links that point at a Perfume__c record.
        Map<Id, Set<Id>> docIdsByPerfume = new Map<Id, Set<Id>>();
        Set<Id> allDocIds = new Set<Id>();

        for (ContentDocumentLink link : newLinks) {
            if (link.LinkedEntityId == null ||
                !String.valueOf(link.LinkedEntityId).startsWith(perfumePrefix)) {
                continue;
            }

            if (!docIdsByPerfume.containsKey(link.LinkedEntityId)) {
                docIdsByPerfume.put(link.LinkedEntityId, new Set<Id>());
            }

            docIdsByPerfume.get(link.LinkedEntityId).add(link.ContentDocumentId);
            allDocIds.add(link.ContentDocumentId);
        }

        if (allDocIds.isEmpty()) {
            return;
        }

        // 2. Latest version of each file, images only.
        Map<Id, ContentVersion> latestVersionByDoc =
            new Map<Id, ContentVersion>();

        for (ContentVersion version : [
            SELECT Id, ContentDocumentId, Title, FileExtension, CreatedDate
            FROM ContentVersion
            WHERE ContentDocumentId IN :allDocIds
            AND IsLatest = true
        ]) {
            if (version.FileExtension != null &&
                IMAGE_EXTENSIONS.contains(version.FileExtension.toLowerCase())) {

                latestVersionByDoc.put(version.ContentDocumentId, version);
            }
        }

        if (latestVersionByDoc.isEmpty()) {
            return;
        }

        // 3. One winner per Perfume: the newest image in this batch.
        Map<Id, ContentVersion> winnerByPerfume = new Map<Id, ContentVersion>();

        for (Id perfumeId : docIdsByPerfume.keySet()) {
            ContentVersion winner;

            for (Id docId : docIdsByPerfume.get(perfumeId)) {
                ContentVersion candidate = latestVersionByDoc.get(docId);

                if (candidate == null) {
                    continue;
                }

                if (winner == null || isNewer(candidate, winner)) {
                    winner = candidate;
                }
            }

            if (winner != null) {
                winnerByPerfume.put(perfumeId, winner);
            }
        }

        if (winnerByPerfume.isEmpty()) {
            return;
        }

        Set<Id> winnerDocIds = new Set<Id>();
        for (ContentVersion winner : winnerByPerfume.values()) {
            winnerDocIds.add(winner.ContentDocumentId);
        }

        // 4. Reuse an existing public link when it still shows the right image.
        //    ContentDistribution allows only one record per ContentVersion.
        Map<Id, ContentDistribution> usableByDoc =
            new Map<Id, ContentDistribution>();

        for (ContentDistribution existing : [
            SELECT Id, ContentVersionId, ContentDocumentId,
                   ContentDownloadUrl, PreferencesLinkLatestVersion
            FROM ContentDistribution
            WHERE ContentDocumentId IN :winnerDocIds
        ]) {
            ContentVersion latest =
                latestVersionByDoc.get(existing.ContentDocumentId);

            if (latest != null &&
                (existing.ContentVersionId == latest.Id ||
                 existing.PreferencesLinkLatestVersion == true)) {

                usableByDoc.put(existing.ContentDocumentId, existing);
            }
        }

        // 5. Create the missing public links in one bulk insert.
        List<ContentDistribution> toInsert = new List<ContentDistribution>();

        for (Id docId : winnerDocIds) {
            if (usableByDoc.containsKey(docId)) {
                continue;
            }

            ContentVersion latest = latestVersionByDoc.get(docId);

            toInsert.add(new ContentDistribution(
                Name = latest.Title,
                ContentVersionId = latest.Id,
                PreferencesAllowViewInBrowser = true,
                PreferencesLinkLatestVersion = LINK_LATEST_VERSION,
                PreferencesNotifyOnVisit = false
            ));
        }

        if (!toInsert.isEmpty()) {
            logFailures('ContentDistribution insert',
                Database.insert(toInsert, false));

            Set<Id> newIds = new Set<Id>();
            for (ContentDistribution created : toInsert) {
                if (created.Id != null) {
                    newIds.add(created.Id);
                }
            }

            // The URL is generated by Salesforce, so read it back.
            if (!newIds.isEmpty()) {
                for (ContentDistribution created : [
                    SELECT Id, ContentVersionId, ContentDocumentId,
                           ContentDownloadUrl, PreferencesLinkLatestVersion
                    FROM ContentDistribution
                    WHERE Id IN :newIds
                ]) {
                    usableByDoc.put(created.ContentDocumentId, created);
                }
            }
        }

        // 6. Write the URL onto each Perfume in one bulk update.
        List<Perfume__c> perfumesToUpdate = new List<Perfume__c>();

        for (Id perfumeId : winnerByPerfume.keySet()) {
            ContentDistribution distribution = usableByDoc.get(
                winnerByPerfume.get(perfumeId).ContentDocumentId
            );

            if (distribution == null ||
                String.isBlank(distribution.ContentDownloadUrl)) {
                continue;
            }

            perfumesToUpdate.add(new Perfume__c(
                Id = perfumeId,
                Product_Image_URL__c = distribution.ContentDownloadUrl
            ));
        }

        if (!perfumesToUpdate.isEmpty()) {
            logFailures('Perfume update',
                Database.update(perfumesToUpdate, false));
        }
    }

    private static Boolean isNewer(ContentVersion a, ContentVersion b) {
        if (a.CreatedDate != b.CreatedDate) {
            return a.CreatedDate > b.CreatedDate;
        }
        return String.valueOf(a.Id) > String.valueOf(b.Id);
    }

    private static void logFailures(
        String label,
        List<Database.SaveResult> results
    ) {
        for (Database.SaveResult result : results) {
            if (!result.isSuccess()) {
                for (Database.Error error : result.getErrors()) {
                    System.debug(LoggingLevel.ERROR,
                        'PerfumeImageService ' + label + ' failed'
                        + ' | ' + error.getStatusCode()
                        + ' | ' + error.getMessage());
                }
            }
        }
    }
}