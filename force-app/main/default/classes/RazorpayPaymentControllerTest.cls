@IsTest
private class RazorpayPaymentControllerTest {

    private class CreatePaymentLinkMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest request) {
            System.assertEquals('POST', request.getMethod());
            Map<String, Object> requestBody =
                (Map<String, Object>)JSON.deserializeUntyped(
                    request.getBody()
                );
            System.assertEquals(20000, requestBody.get('amount'));
            System.assertEquals('INR', requestBody.get('currency'));

            HttpResponse response = new HttpResponse();
            response.setStatusCode(201);
            response.setHeader('Content-Type', 'application/json');
            response.setBody(JSON.serialize(new Map<String, Object>{
                'id' => 'plink_test_create',
                'short_url' => 'https://rzp.io/i/test',
                'reference_id' => requestBody.get('reference_id')
            }));
            return response;
        }
    }

    private class PaidPaymentMock implements HttpCalloutMock {
        private String referenceId;

        PaidPaymentMock(String referenceId) {
            this.referenceId = referenceId;
        }

        public HttpResponse respond(HttpRequest request) {
            HttpResponse response = new HttpResponse();
            response.setStatusCode(200);
            response.setHeader('Content-Type', 'application/json');

            if (request.getEndpoint().contains('/payment_links/')) {
                response.setBody(JSON.serialize(new Map<String, Object>{
                    'id' => 'plink_test_verify',
                    'status' => 'paid',
                    'reference_id' => referenceId,
                    'currency' => 'INR',
                    'amount' => 20000,
                    'payments' => new List<Object>{
                        new Map<String, Object>{
                            'payment_id' => 'pay_test_verify',
                            'status' => 'captured',
                            'plink_id' => 'plink_test_verify'
                        }
                    }
                }));
            } else {
                response.setBody(JSON.serialize(new Map<String, Object>{
                    'id' => 'pay_test_verify',
                    'status' => 'captured',
                    'currency' => 'INR',
                    'amount' => 20000
                }));
            }
            return response;
        }
    }

    private class PendingPaymentLinkMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest request) {
            HttpResponse response = new HttpResponse();
            response.setStatusCode(200);
            response.setHeader('Content-Type', 'application/json');
            response.setBody('{"status":"created","payments":[]}');
            return response;
        }
    }

    private class FailedPaymentLinkStatusMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest request) {
            HttpResponse response = new HttpResponse();
            response.setStatusCode(503);
            response.setBody('{"error":"temporarily unavailable"}');
            return response;
        }
    }

    private class PaidLinkWithoutCapturedPaymentMock
        implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest request) {
            HttpResponse response = new HttpResponse();
            response.setStatusCode(200);
            response.setBody('{"status":"paid","payments":[]}');
            return response;
        }
    }

    private class FailedCreatePaymentLinkMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest request) {
            HttpResponse response = new HttpResponse();
            response.setStatusCode(400);
            response.setBody('{"error":"bad request"}');
            return response;
        }
    }

    private class InvalidCreatePaymentLinkMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest request) {
            Map<String, Object> requestBody =
                (Map<String, Object>)JSON.deserializeUntyped(
                    request.getBody()
                );
            HttpResponse response = new HttpResponse();
            response.setStatusCode(201);
            response.setBody(JSON.serialize(new Map<String, Object>{
                'id' => 'plink_test_invalid',
                'short_url' => 'https://example.com/not-razorpay',
                'reference_id' => requestBody.get('reference_id')
            }));
            return response;
        }
    }

    @IsTest
    static void testCreatePaymentLinkPersistsPayment() {
        ScentSphereControllerTestData.CustomerContext customer =
            ScentSphereControllerTestData.createCustomer('RazorCreate');
        Id orderId;
        System.runAs(customer.customer) {
            Customer_Order__c orderRecord =
                ScentSphereControllerTestData.buildOrder(
                    customer.contactId,
                    'Pending',
                    'Pending',
                    200
                );
            insert orderRecord;
            orderId = orderRecord.Id;

            Test.setMock(HttpCalloutMock.class, new CreatePaymentLinkMock());
            Test.startTest();
            RazorpayPaymentController.RazorpayPaymentLinkResponse result =
                RazorpayPaymentController.createRazorpayPaymentLink(orderId);
            Test.stopTest();

            System.assertEquals('plink_test_create', result.paymentLinkId);
            System.assertEquals('https://rzp.io/i/test', result.paymentLinkUrl);
            System.assertNotEquals(null, result.referenceId);
            Payment__c savedPayment = [
                SELECT Id, Payment_Amount__c, Payment_Status__c,
                       Razorpay_Payment_Link_ID__c,
                       Payment_Link_Reference_ID__c
                FROM Payment__c
                WHERE Id = :result.paymentRecordId
                WITH SYSTEM_MODE
            ];
            System.assertEquals(200, savedPayment.Payment_Amount__c);
            System.assertEquals('Pending', savedPayment.Payment_Status__c);
            System.assertEquals(
                result.paymentLinkId,
                savedPayment.Razorpay_Payment_Link_ID__c
            );
            System.assertEquals(
                result.referenceId,
                savedPayment.Payment_Link_Reference_ID__c
            );
        }
    }

    @IsTest
    static void testCreatePaymentLinkRejectsInvalidOrdersAndResponses() {
        ScentSphereControllerTestData.CustomerContext customer =
            ScentSphereControllerTestData.createCustomer('RazorCreateErrors');
        Id paidOrderId;
        Id invalidAmountOrderId;
        Id pendingOrderId;
        System.runAs(customer.customer) {
            Customer_Order__c paidOrder =
                ScentSphereControllerTestData.buildOrder(
                    customer.contactId,
                    'Confirmed',
                    'Paid',
                    200
                );
            Customer_Order__c invalidAmountOrder =
                ScentSphereControllerTestData.buildOrder(
                    customer.contactId,
                    'Pending',
                    'Pending',
                    0
                );
            Customer_Order__c pendingOrder =
                ScentSphereControllerTestData.buildOrder(
                    customer.contactId,
                    'Pending',
                    'Pending',
                    200
                );
            insert new List<Customer_Order__c>{
                paidOrder,
                invalidAmountOrder,
                pendingOrder
            };
            paidOrderId = paidOrder.Id;
            invalidAmountOrderId = invalidAmountOrder.Id;
            pendingOrderId = pendingOrder.Id;

            assertCreatePaymentLinkThrows(null);
            assertCreatePaymentLinkThrows(paidOrderId);
            assertCreatePaymentLinkThrows(invalidAmountOrderId);

            Test.setMock(
                HttpCalloutMock.class,
                new FailedCreatePaymentLinkMock()
            );
            assertCreatePaymentLinkThrows(pendingOrderId);

            Test.setMock(
                HttpCalloutMock.class,
                new InvalidCreatePaymentLinkMock()
            );
            assertCreatePaymentLinkThrows(pendingOrderId);
        }

        System.runAs(customer.owner) {
            assertCreatePaymentLinkThrows(null);
        }
    }

    @IsTest
    static void testVerifyPaymentUpdatesOrderAndInventory() {
        ScentSphereControllerTestData.CustomerContext customer =
            ScentSphereControllerTestData.createCustomer('RazorVerify');

        Perfume__c perfume;
        Id orderId;
        Id paymentId;
        String referenceId = 'test_reference_verify';
        System.runAs(customer.owner) {
            perfume = ScentSphereControllerTestData.createPerfume(
                'Razorpay Verify Perfume',
                8
            );
        }

        System.runAs(customer.customer) {
            Customer_Order__c orderRecord =
                ScentSphereControllerTestData.buildOrder(
                    customer.contactId,
                    'Pending',
                    'Pending',
                    200
                );
            insert orderRecord;
            orderId = orderRecord.Id;

            insert new Order_Item__c(
                Customer_Order__c = orderId,
                Perfume__c = perfume.Id,
                Quantity__c = 2,
                Unit_Price__c = 100
            );
        }
        System.runAs(customer.owner) {
            insert new Payment__c(
                Customer_Order__c = orderId,
                Payment_Amount__c = 200,
                Payment_Status__c = 'Pending',
                Payment_Method__c = 'Razorpay',
                Razorpay_Payment_Link_ID__c = 'plink_test_verify',
                Payment_Link_Reference_ID__c = referenceId,
                Signature_Verified__c = false
            );
        }

        paymentId = [
            SELECT Id
            FROM Payment__c
            WHERE Razorpay_Payment_Link_ID__c = 'plink_test_verify'
            LIMIT 1
        ].Id;

        Test.setMock(
            HttpCalloutMock.class,
            new PaidPaymentMock(referenceId)
        );
        Boolean verified;
        System.runAs(customer.customer) {
            Test.startTest();
            verified = RazorpayPaymentController.verifyRazorpayPaymentLink(
                'plink_test_verify',
                'pay_test_verify'
            );
            Test.stopTest();
        }

        System.assertEquals(true, verified);
        Payment__c payment = [
            SELECT Payment_Status__c, Razorpay_Payment_ID__c
            FROM Payment__c
            WHERE Id = :paymentId
            WITH SYSTEM_MODE
        ];
        Customer_Order__c orderRecord = [
            SELECT Order_Status__c, Payment_Status__c
            FROM Customer_Order__c
            WHERE Id = :orderId
        ];
        Perfume__c updatedPerfume = [
            SELECT Stock_Quantity__c
            FROM Perfume__c
            WHERE Id = :perfume.Id
        ];
        System.assertEquals('Paid', payment.Payment_Status__c);
        System.assertEquals('pay_test_verify', payment.Razorpay_Payment_ID__c);
        System.assertEquals('Confirmed', orderRecord.Order_Status__c);
        System.assertEquals('Paid', orderRecord.Payment_Status__c);
        System.assertEquals(6, updatedPerfume.Stock_Quantity__c);
    }

    @IsTest
    static void testCheckPaymentLinkStatusPendingAndBlankInput() {
        ScentSphereControllerTestData.CustomerContext customer =
            ScentSphereControllerTestData.createCustomer('RazorPoll');
        Id orderId;
        System.runAs(customer.customer) {
            Customer_Order__c orderRecord =
                ScentSphereControllerTestData.buildOrder(
                    customer.contactId,
                    'Pending',
                    'Pending',
                    200
                );
            insert orderRecord;
            orderId = orderRecord.Id;
        }
        System.runAs(customer.owner) {
            insert new Payment__c(
                Customer_Order__c = orderId,
                Payment_Amount__c = 200,
                Payment_Status__c = 'Pending',
                Payment_Method__c = 'Razorpay',
                Razorpay_Payment_Link_ID__c = 'plink_test_pending',
                Payment_Link_Reference_ID__c = 'test_reference_pending'
            );
        }

        System.runAs(customer.customer) {
            Test.setMock(
                HttpCalloutMock.class,
                new PendingPaymentLinkMock()
            );
            Test.startTest();
            RazorpayPaymentController.PaymentStatusResponse result =
                RazorpayPaymentController.checkPaymentLinkStatus(
                    ' plink_test_pending '
                );
            Test.stopTest();
            System.assertEquals('PENDING', result.status);
            System.assertEquals(null, result.razorpayPaymentId);

            Test.setMock(
                HttpCalloutMock.class,
                new FailedPaymentLinkStatusMock()
            );
            RazorpayPaymentController.PaymentStatusResponse unavailable =
                RazorpayPaymentController.checkPaymentLinkStatus(
                    'plink_test_pending'
                );
            System.assertEquals('PENDING', unavailable.status);

            Test.setMock(
                HttpCalloutMock.class,
                new PaidLinkWithoutCapturedPaymentMock()
            );
            RazorpayPaymentController.PaymentStatusResponse awaitingCapture =
                RazorpayPaymentController.checkPaymentLinkStatus(
                    'plink_test_pending'
                );
            System.assertEquals('PENDING', awaitingCapture.status);

            Boolean exceptionThrown = false;
            try {
                RazorpayPaymentController.checkPaymentLinkStatus(' ');
            } catch (AuraHandledException e) {
                exceptionThrown = true;
            }
            System.assert(exceptionThrown, 'Blank link IDs must be rejected.');
        }
    }

    @IsTest
    static void testPaidPaymentIsIdempotentAndStatusIsReturnedLocally() {
        ScentSphereControllerTestData.CustomerContext customer =
            ScentSphereControllerTestData.createCustomer('RazorPaid');
        Id orderId;
        System.runAs(customer.customer) {
            Customer_Order__c orderRecord =
                ScentSphereControllerTestData.buildOrder(
                    customer.contactId,
                    'Confirmed',
                    'Paid',
                    200
                );
            insert orderRecord;
            orderId = orderRecord.Id;
        }

        System.runAs(customer.owner) {
                insert new Payment__c(
                    Customer_Order__c = orderId,
                    Payment_Amount__c = 200,
                    Payment_Status__c = 'Paid',
                    Payment_Method__c = 'Razorpay',
                    Razorpay_Payment_Link_ID__c = 'plink_test_already_paid',
                    Razorpay_Payment_ID__c = 'pay_test_already_paid',
                    Payment_Link_Reference_ID__c = 'test_reference_paid'
                );
        }

        System.runAs(customer.customer) {
            assertVerifyPaymentLinkThrows('', 'pay_test_already_paid');
            assertVerifyPaymentLinkThrows(
                'plink_test_already_paid',
                ' '
            );
            assertVerifyPaymentLinkThrows(
                'plink_test_unknown',
                'pay_test_already_paid'
            );

            Test.startTest();
            System.assertEquals(
                true,
                RazorpayPaymentController.verifyRazorpayPaymentLink(
                    'plink_test_already_paid',
                    'pay_test_already_paid'
                )
            );
            System.assertEquals(
                false,
                RazorpayPaymentController.verifyRazorpayPaymentLink(
                    'plink_test_already_paid',
                    'pay_test_different'
                )
            );
            RazorpayPaymentController.PaymentStatusResponse status =
                RazorpayPaymentController.checkPaymentLinkStatus(
                    'plink_test_already_paid'
                );
            Test.stopTest();

            System.assertEquals('PAID', status.status);
            System.assertEquals(
                'pay_test_already_paid',
                status.razorpayPaymentId
            );
        }
    }

    private static void assertCreatePaymentLinkThrows(Id orderId) {
        Boolean exceptionThrown = false;
        try {
            RazorpayPaymentController.createRazorpayPaymentLink(orderId);
        } catch (AuraHandledException e) {
            exceptionThrown = true;
        }
        System.assert(exceptionThrown, 'Expected an AuraHandledException.');
    }

    private static void assertVerifyPaymentLinkThrows(
        String paymentLinkId,
        String paymentId
    ) {
        Boolean exceptionThrown = false;
        try {
            RazorpayPaymentController.verifyRazorpayPaymentLink(
                paymentLinkId,
                paymentId
            );
        } catch (AuraHandledException e) {
            exceptionThrown = true;
        }
        System.assert(exceptionThrown, 'Expected an AuraHandledException.');
    }
}
