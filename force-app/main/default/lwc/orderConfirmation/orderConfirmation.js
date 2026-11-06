import { LightningElement, wire } from 'lwc';
import { CurrentPageReference, NavigationMixin } from 'lightning/navigation';

import getOrderDetails from '@salesforce/apex/OrderConfirmationController.getOrderDetails';

export default class OrderConfirmation extends NavigationMixin(LightningElement) {

    orderId;
    order;
    orderItems = [];

    isLoading = true;
    errorMessage = '';

    @wire(CurrentPageReference)
    getPageReference(pageReference) {
        if (pageReference) {
            this.orderId = pageReference.state?.c__orderId;
        }
    }

    @wire(getOrderDetails, { orderId: '$orderId' })
    wiredOrder({ data, error }) {

        if (data) {
            this.order = {
                ...data.orderRecord,
                formattedTotal: this.formatCurrency(
                    data.orderRecord.Total_Amount__c
                )
            };

            this.orderItems = (data.orderItems || []).map(item => ({
                ...item,
                productName: item.Perfume__r?.Product_Name__c,
                formattedPrice: this.formatCurrency(item.Unit_Price__c),
                formattedSubtotal: this.formatCurrency(item.Subtotal__c)
            }));

            this.errorMessage = '';
            this.isLoading = false;

        } else if (error) {
            this.order = undefined;
            this.orderItems = [];
            this.errorMessage =
                error.body?.message || 'Unable to load order details.';
            this.isLoading = false;
        }
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount || 0);
    }

    handleContinueShopping() {
        this[NavigationMixin.Navigate]({
            type: 'comm__namedPage',
            attributes: {
                name: 'Shop__c'
            }
        });
    }
}
