@IsTest
private class ScentSphereAccountControllerTest {

    @IsTest
    static void testGetAccountDataAndOrderDetails() {
        ScentSphereControllerTestData.CustomerContext customer =
            ScentSphereControllerTestData.createCustomer('Account');

        Id confirmedOrderId;
        Perfume__c perfume;
        System.runAs(customer.owner) {
            perfume = ScentSphereControllerTestData.createPerfume(
                'Account Controller Perfume',
                5
            );
        }

        System.runAs(customer.customer) {
            Customer_Order__c confirmedOrder =
                ScentSphereControllerTestData.buildOrder(
                    customer.contactId,
                    'Confirmed',
                    'Paid',
                    400
                );
            Customer_Order__c pendingOrder =
                ScentSphereControllerTestData.buildOrder(
                    customer.contactId,
                    'Pending',
                    'Pending',
                    200
                );
            insert new List<Customer_Order__c>{ confirmedOrder, pendingOrder };
            confirmedOrderId = confirmedOrder.Id;

            insert new Order_Item__c(
                Customer_Order__c = confirmedOrder.Id,
                Perfume__c = perfume.Id,
                Quantity__c = 2,
                Unit_Price__c = 200
            );

            Test.startTest();
            ScentSphereAccountController.AccountData accountData =
                ScentSphereAccountController.getAccountData();
            ScentSphereAccountController.OrderDetailsResponse details =
                ScentSphereAccountController.getOrderDetails(confirmedOrderId);
            Test.stopTest();

            System.assertEquals(UserInfo.getUserId(), accountData.customerUser.Id);
            System.assertEquals(customer.contactId, accountData.customer.Id);
            System.assertEquals(
                1,
                accountData.orders.size(),
                'Only confirmed orders should be included.'
            );
            System.assertEquals(
                confirmedOrderId,
                accountData.orders[0].Id
            );
            System.assertEquals(confirmedOrderId, details.orderRecord.Id);
            System.assertEquals(1, details.items.size());
            System.assertEquals(perfume.Id, details.items[0].Perfume__c);
            System.assertEquals(2, details.items[0].Quantity__c);
        }
    }

    @IsTest
    static void testGetOrderDetailsRejectsInvalidAndUnownedOrders() {
        ScentSphereControllerTestData.CustomerContext customerA =
            ScentSphereControllerTestData.createCustomer('AccountA');
        ScentSphereControllerTestData.CustomerContext customerB =
            ScentSphereControllerTestData.createCustomer('AccountB');

        Id otherOrderId;
        System.runAs(customerB.customer) {
            Customer_Order__c orderRecord =
                ScentSphereControllerTestData.buildOrder(
                    customerB.contactId,
                    'Confirmed',
                    'Paid',
                    200
                );
            insert orderRecord;
            otherOrderId = orderRecord.Id;
        }

        System.runAs(customerA.customer) {
            assertOrderDetailsThrows(null);
            assertOrderDetailsThrows(otherOrderId);
        }
    }

    @IsTest
    static void testAccountDataReturnsEmptyOrdersWithoutContact() {
        ScentSphereControllerTestData.CustomerContext customer =
            ScentSphereControllerTestData.createCustomer('AccountNoContact');

        System.runAs(customer.owner) {
            ScentSphereAccountController.AccountData result =
                ScentSphereAccountController.getAccountData();
            System.assertEquals(UserInfo.getUserId(), result.customerUser.Id);
            System.assertEquals(null, result.customer);
            System.assertEquals(0, result.orders.size());
        }
    }

    private static void assertOrderDetailsThrows(Id orderId) {
        Boolean exceptionThrown = false;
        try {
            ScentSphereAccountController.getOrderDetails(orderId);
        } catch (AuraHandledException e) {
            exceptionThrown = true;
        }
        System.assert(exceptionThrown, 'Expected an AuraHandledException.');
    }
}
