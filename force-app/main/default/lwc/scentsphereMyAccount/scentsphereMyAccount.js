
import { LightningElement, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getAccountData from '@salesforce/apex/ScentSphereAccountController.getAccountData';

export default class ScentsphereMyAccount extends NavigationMixin(LightningElement) {

    accountData;
    error;
    isLoading = true;

    @wire(getAccountData)
    wiredAccountData({ data, error }) {
        this.isLoading = false;

        if (data) {
            this.accountData = data;
            this.error = undefined;
        } else if (error) {
            this.error = error;
            this.accountData = undefined;
            console.error('My Account Error:', JSON.stringify(error));
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
        return this.customerUser.FirstName || this.customer.FirstName || '—';
    }

    get lastName() {
        return this.customerUser.LastName || this.customer.LastName || '—';
    }

    get email() {
        return this.customerUser.Email || this.customer.Email || '—';
    }

    get username() {
        return this.customerUser.Username || '—';
    }

    get phone() {
        return this.customerUser.Phone || this.customer.Phone || '—';
    }

    get fullName() {
        const first = this.customerUser.FirstName || this.customer.FirstName || '';
        const last = this.customerUser.LastName || this.customer.LastName || '';

        return `${first} ${last}`.trim() || 'ScentSphere Customer';
    }

    get initials() {
        const first = this.customerUser.FirstName || this.customer.FirstName || '';
        const last = this.customerUser.LastName || this.customer.LastName || '';

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
                ? new Date(order.Order_Date__c + 'T00:00:00').toLocaleDateString('en-IN')
                : '—',

            formattedAmount: new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR',
                maximumFractionDigits: 2
            }).format(order.Total_Amount__c || 0)
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

        return parts.length ? parts.join(', ') : 'Address not available';
    }

    get accountName() {
        return this.customer.Account?.Name || '—';
    }

    get hasError() {
        return !!this.error;
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
