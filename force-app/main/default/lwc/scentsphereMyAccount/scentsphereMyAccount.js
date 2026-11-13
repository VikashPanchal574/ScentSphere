
import { LightningElement, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';

import getAccountData
    from '@salesforce/apex/ScentSphereAccountController.getAccountData';

import getOrderDetails
    from '@salesforce/apex/ScentSphereAccountController.getOrderDetails';

export default class ScentsphereMyAccount extends NavigationMixin(LightningElement) {

    accountData;
    error;
    isLoading = true;

    // Order details modal
    isOrderDetailsOpen = false;
    isLoadingOrderDetails = false;
    orderDetailsError = '';
    orderDetails;

    @wire(getAccountData)
    wiredAccountData({ data, error }) {
        this.isLoading = false;

        if (data) {
            this.accountData = data;
            this.error = undefined;

        } else if (error) {
            this.error = error;
            this.accountData = undefined;

            console.error(
                'My Account Error:',
                JSON.stringify(error)
            );
        }
    }

    get customerUser() {
        return this.accountData?.customerUser || {};
    }

    get customer() {
        return this.accountData?.customer || {};
    }

    get orders() {
        return this.accountData?.orders || [];
    }

    get hasOrders() {
        return this.orders.length > 0;
    }

    get firstName() {
        return this.customerUser.FirstName ||
            this.customer.FirstName || '—';
    }

    get lastName() {
        return this.customerUser.LastName ||
            this.customer.LastName || '—';
    }

    get email() {
        return this.customerUser.Email ||
            this.customer.Email || '—';
    }

    get username() {
        return this.customerUser.Username || '—';
    }

    get phone() {
        return this.customerUser.Phone ||
            this.customer.Phone || '—';
    }

    get fullName() {
        const first =
            this.customerUser.FirstName || this.customer.FirstName || '';

        const last =
            this.customerUser.LastName || this.customer.LastName || '';

        return `${first} ${last}`.trim() || 'ScentSphere Customer';
    }

    get initials() {
        const first =
            this.customerUser.FirstName || this.customer.FirstName || '';

        const last =
            this.customerUser.LastName || this.customer.LastName || '';

        return (first.charAt(0) + last.charAt(0)).toUpperCase() || 'S';
    }

    get customerSince() {
        if (!this.customerUser.CreatedDate) {
            return '';
        }

        return new Date(this.customerUser.CreatedDate).toLocaleDateString(
            'en-IN',
            { month: 'long', year: 'numeric' }
        );
    }

    get formattedOrders() {
        return this.orders.map(order => ({
            ...order,

            formattedDate: order.Order_Date__c
                ? new Date(
                    order.Order_Date__c + 'T00:00:00'
                ).toLocaleDateString('en-IN')
                : '—',

            formattedAmount: this.formatCurrency(
                order.Total_Amount__c
            ),

            accessibleLabel: `View details for order ${order.Name}`
        }));
    }

    get address() {
        const parts = [
            this.customer.MailingStreet,
            this.customer.MailingCity,
            this.customer.MailingState,
            this.customer.MailingPostalCode,
            this.customer.MailingCountry
        ].filter(Boolean);

        return parts.length
            ? parts.join(', ')
            : 'Address not available';
    }

    get accountName() {
        return this.customer.Account?.Name || '—';
    }

    get hasError() {
        return !!this.error;
    }

    // ==========================================
    // OPEN ORDER DETAILS
    // ==========================================

    handleOrderClick(event) {
        const orderId = event.currentTarget.dataset.id;

        this.loadOrderDetails(orderId);
    }

    // Keyboard accessibility for clickable rows
    handleOrderKeydown(event) {

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();

            const orderId = event.currentTarget.dataset.id;

            this.loadOrderDetails(orderId);
        }
    }

    async loadOrderDetails(orderId) {

        if (!orderId) {
            return;
        }

        this.isOrderDetailsOpen = true;
        this.isLoadingOrderDetails = true;
        this.orderDetailsError = '';
        this.orderDetails = undefined;

        try {

            const response = await getOrderDetails({
                orderId: orderId
            });

            this.orderDetails = response;

        } catch (error) {

            console.error(
                'Order Details Error:',
                JSON.stringify(error)
            );

            this.orderDetailsError =
                error?.body?.message ||
                'Unable to load order details. Please try again.';

        } finally {

            this.isLoadingOrderDetails = false;
        }
    }

    // ==========================================
    // ORDER DETAILS GETTERS
    // ==========================================

    get selectedOrder() {
        return this.orderDetails?.orderRecord || {};
    }

    get formattedOrderDate() {

        const date = this.selectedOrder.Order_Date__c;

        return date
            ? new Date(date + 'T00:00:00').toLocaleDateString(
                'en-IN',
                {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric'
                }
            )
            : '—';
    }

    get formattedOrderTotal() {
        return this.formatCurrency(
            this.selectedOrder.Total_Amount__c
        );
    }

    get formattedShippingAddress() {
        return this.selectedOrder.Shipping_Address__c ||
            'Shipping address not available.';
    }

    get formattedOrderItems() {

        const items = this.orderDetails?.items || [];

        return items.map(item => {

            const quantity = Number(item.Quantity__c || 0);
            const unitPrice = Number(item.Unit_Price__c || 0);

            return {
                ...item,

                productName:
                    item.Perfume__r?.Product_Name__c ||
                    'Perfume',

                brand:
                    item.Perfume__r?.Brand__c || '',

                size:
                    item.Perfume__r?.Size__c || '',

                imageUrl:
                    item.Perfume__r?.Product_Image_URL__c || '',

                quantity: quantity,

                formattedUnitPrice:
                    this.formatCurrency(unitPrice),

                formattedSubtotal:
                    this.formatCurrency(quantity * unitPrice)
            };
        });
    }

    get hasOrderItems() {
        return this.formattedOrderItems.length > 0;
    }

    // ==========================================
    // MODAL CONTROLS
    // ==========================================

    handleCloseOrderDetails() {
        this.isOrderDetailsOpen = false;
        this.orderDetails = undefined;
        this.orderDetailsError = '';
    }

    handleModalBackdropClick(event) {

        if (event.target === event.currentTarget) {
            this.handleCloseOrderDetails();
        }
    }

    // ==========================================
    // COMMON HELPERS
    // ==========================================

    formatCurrency(value) {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 2
        }).format(Number(value || 0));
    }

    handleLogout() {

        this[NavigationMixin.Navigate]({

            type: 'comm__loginPage',

            attributes: {
                actionName: 'logout'
            }
        });
    }
}
