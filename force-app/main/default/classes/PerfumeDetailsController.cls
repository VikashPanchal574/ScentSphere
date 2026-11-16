
public with sharing class PerfumeDetailsController {

    // ==========================================
    // PRODUCT DETAILS
    // ==========================================

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

    // ==========================================
    // RELATED PRODUCTS PAGINATION RESPONSE
    // ==========================================

    public class RelatedPerfumesResponse {

        @AuraEnabled
        public List<Perfume__c> products { get; set; }

        @AuraEnabled
        public Integer totalCount { get; set; }

        @AuraEnabled
        public Integer totalPages { get; set; }

        @AuraEnabled
        public Integer pageNumber { get; set; }

        public RelatedPerfumesResponse() {
            products = new List<Perfume__c>();
            totalCount = 0;
            totalPages = 0;
            pageNumber = 1;
        }
    }

    // ==========================================
    // GET SAME CATEGORY PERFUMES
    // ==========================================

    @AuraEnabled
    public static RelatedPerfumesResponse getRelatedPerfumes(
        Id perfumeId,
        Integer pageNumber
    ) {

        if (perfumeId == null) {
            throw new AuraHandledException(
                'Perfume ID is required.'
            );
        }

        try {

            Integer pageSize = 4;

            RelatedPerfumesResponse response =
                new RelatedPerfumesResponse();

            // Find category of current perfume
            List<Perfume__c> currentPerfumes = [
                SELECT Id, Category__c
                FROM Perfume__c
                WHERE Id = :perfumeId
                AND Active__c = true
                WITH USER_MODE
                LIMIT 1
            ];

            if (currentPerfumes.isEmpty()) {
                return response;
            }

            String category =
                currentPerfumes[0].Category__c;

            if (String.isBlank(category)) {
                return response;
            }

            // Count other active perfumes in category
            response.totalCount = [
                SELECT COUNT()
                FROM Perfume__c
                WHERE Category__c = :category
                AND Active__c = true
                 AND Gift_Collection__c = null
                AND Id != :perfumeId
                WITH USER_MODE
            ];

            if (response.totalCount == 0) {
                return response;
            }

            Integer requestedPage =
                pageNumber == null || pageNumber < 1
                    ? 1
                    : pageNumber;

            Integer calculatedPages =
                (response.totalCount + pageSize - 1)
                / pageSize;

            // OFFSET supports up to 2000 skipped rows.
            // Four products per page allow 501 pages.
            response.totalPages = Math.min(
                calculatedPages,
                501
            );

            response.pageNumber = Math.min(
                requestedPage,
                response.totalPages
            );

            Integer offsetRows =
                (response.pageNumber - 1) * pageSize;

            // Fetch only four products for this page
            response.products = [
                SELECT Id,
                       Product_Name__c,
                       Brand__c,
                       Category__c,
                       Price__c,
                       Size__c,
                       Product_Image_URL__c,
                       Stock_Quantity__c,
                       Active__c
                FROM Perfume__c
                WHERE Category__c = :category
                AND Active__c = true
                AND Id != :perfumeId
                  AND Gift_Collection__c = null
                WITH USER_MODE
                ORDER BY CreatedDate DESC, Id DESC
                LIMIT :pageSize
                OFFSET :offsetRows
            ];

            return response;

        } catch (AuraHandledException e) {
            throw e;

        } catch (Exception e) {

            System.debug(
                LoggingLevel.ERROR,
                'Related Perfumes Error: ' + e.getMessage()
            );

            throw new AuraHandledException(
                'Unable to load related fragrances.'
            );
        }
    }
}
