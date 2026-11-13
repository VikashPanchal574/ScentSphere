
import { LightningElement, api, wire } from 'lwc';

import {
    CurrentPageReference,
    NavigationMixin
} from 'lightning/navigation';

import {
    MessageContext,
    publish
} from 'lightning/messageService';

import CART_UPDATE
    from '@salesforce/messageChannel/CartUpdate__c';

import addToCart from '@salesforce/apex/CartController.addToCart';

import getPerfumeDetails
    from '@salesforce/apex/PerfumeDetailsController.getPerfumeDetails';

export default class PerfumeDetails extends NavigationMixin(LightningElement) {

    @api recordId;

    perfume;
    isLoading = true;
    errorMessage = '';
    quantity = 1;

    isAddingToCart = false;
    cartMessage = '';
    cartError = '';

    navigationSource = 'shop';
    returnPageName;
    returnCategory = 'All';

    // LMS Message Context
    @wire(MessageContext)
    messageContext;

    // Read navigation information from URL
    @wire(CurrentPageReference)
    getPageReference(pageReference) {

        if (pageReference) {

            const state = pageReference.state || {};
            const idFromUrl = state.c__recordId;

            if (idFromUrl) {
                this.recordId = idFromUrl;
            }

            this.navigationSource = state.c__source || 'shop';
            this.returnPageName = state.c__returnPage;
            this.returnCategory = state.c__category || 'All';
        }
    }

    // Dynamic Back Button Label
    get backButtonLabel() {

        if (this.navigationSource === 'collections') {
            return 'Back to Collections';
        }

        if (this.navigationSource === 'wishlist') {
            return 'Back to Wishlist';
        }

        if (this.navigationSource === 'gifts') {
            return 'Back to Gifts';
        }

        return 'Back to Shop';
    }

    // Navigate to the original page
    handleBackNavigation() {

        let destinationName = this.returnPageName;

        if (!destinationName) {

            if (this.navigationSource === 'collections') {
                destinationName = 'Collections__c';

            } else if (this.navigationSource === 'wishlist') {
                destinationName = 'My_Wishlist__c';

            } else if (this.navigationSource === 'gifts') {
                destinationName = 'Gifts__c';

            } else {
                destinationName = 'Shop__c';
            }
        }

        this[NavigationMixin.Navigate]({
            type: 'comm__namedPage',
            attributes: {
                name: destinationName
            },
            state: this.navigationSource === 'collections'
                ? { c__category: this.returnCategory }
                : {}
        });
    }

    // Fetch perfume details
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

            // Reset quantity when product changes
            this.quantity = 1;

            this.errorMessage = '';
            this.isLoading = false;

        } else if (error) {

            this.perfume = undefined;
            this.errorMessage = 'Unable to load perfume details.';
            this.isLoading = false;

            console.error('Perfume Details Error:', error);
        }
    }

    // Add to cart
    async handleAddToCart() {

        if (
            !this.perfume ||
            this.isOutOfStock ||
            this.isAddingToCart
        ) {
            return;
        }

        this.isAddingToCart = true;
        this.cartMessage = '';
        this.cartError = '';

        try {

            await addToCart({
                perfumeId: this.perfume.Id,
                quantity: this.quantity
            });

            this.cartMessage =
                'Perfume added to your cart successfully!';

            // Notify Header to refresh cart badge
            publish(this.messageContext, CART_UPDATE, {
                action: 'refresh'
            });

        } catch (error) {

            this.cartError =
                error?.body?.message ||
                'Unable to add perfume to cart.';

        } finally {

            this.isAddingToCart = false;
        }
    }

    // Quantity controls
    handleIncrease() {

        if (
            this.perfume &&
            !this.isOutOfStock &&
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

    // Out of stock check
    get isOutOfStock() {

        return !this.perfume ||
            Number(this.perfume.Stock_Quantity__c) <= 0;
    }

    // Disable increase when stock limit is reached
    get isIncreaseDisabled() {

        return this.isOutOfStock ||
            this.quantity >= Number(this.perfume?.Stock_Quantity__c || 0);
    }

    // Calculate total price
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
