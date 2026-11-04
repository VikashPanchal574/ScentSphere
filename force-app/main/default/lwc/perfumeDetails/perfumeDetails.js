import { LightningElement, api, wire } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';

import getPerfumeDetails
    from '@salesforce/apex/PerfumeDetailsController.getPerfumeDetails';

export default class PerfumeDetails extends LightningElement {

    @api recordId;

    perfume;
    isLoading = true;
    errorMessage = '';
    quantity = 1;

    // Read selected perfume ID from the page URL
    @wire(CurrentPageReference)
    getPageReference(pageReference) {
        if (pageReference) {
            const idFromUrl = pageReference.state?.c__recordId;

            if (idFromUrl) {
                this.recordId = idFromUrl;
            }
        }
    }

    // Fetch perfume details from Apex
    @wire(getPerfumeDetails, { perfumeId: '$recordId' })
    wiredPerfume({ data, error }) {

        if (data) {
            this.perfume = {
                ...data,
                imageUrl: data.Product_Image_URL__c || '',
                formattedPrice: new Intl.NumberFormat('en-IN', {
                    style: 'currency',
                    currency: 'INR',
                    maximumFractionDigits: 0
                }).format(data.Price__c || 0)
            };

            this.errorMessage = '';
            this.isLoading = false;

        } else if (error) {
            this.perfume = undefined;
            this.errorMessage =
                'Unable to load perfume details.';
            this.isLoading = false;

            console.error('Perfume Details Error:', error);
        }
    }

    // Quantity controls
    handleIncrease() {
        if (
            this.perfume &&
            this.quantity < this.perfume.Stock_Quantity__c
        ) {
            this.quantity++;
        }
    }

    handleDecrease() {
        if (this.quantity > 1) {
            this.quantity--;
        }
    }

    get isOutOfStock() {
        return !this.perfume ||
            this.perfume.Stock_Quantity__c <= 0;
    }

    get isIncreaseDisabled() {
        return this.isOutOfStock ||
            this.quantity >= this.perfume.Stock_Quantity__c;
    }

    get totalPrice() {
        if (!this.perfume) {
            return '';
        }

        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(this.perfume.Price__c * this.quantity);
    }
}
