
import { LightningElement, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';

import getFeaturedPerfumes
    from '@salesforce/apex/FeaturedFragrancesController.getFeaturedPerfumes';

export default class FeaturedFragrances extends NavigationMixin(LightningElement) {

    products = [];
    isLoading = true;
    errorMessage = '';

    // Format perfume data received from Apex
    formatProducts(data) {
        return data.map(perfume => ({
            ...perfume,

            imageUrl: perfume.imageUrl || '',

            formattedPrice: new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR',
                maximumFractionDigits: 0
            }).format(perfume.price || 0)
        }));
    }

    // Fetch featured perfumes
    @wire(getFeaturedPerfumes)
    wiredPerfumes({ data, error }) {
        if (data) {
            this.products = this.formatProducts(data);
            this.errorMessage = '';
            this.isLoading = false;

        } else if (error) {
            this.products = [];
            this.errorMessage =
                'Unable to load fragrances. Please try again.';
            this.isLoading = false;

            console.error('Featured Perfumes Error:', error);
        }
    }

    get hasProducts() {
        return this.products.length > 0 && !this.isLoading;
    }

    get showEmpty() {
        return !this.isLoading &&
            !this.errorMessage &&
            this.products.length === 0;
    }

    // Navigate to Product Details page
    handleViewDetails(event) {
    event.stopPropagation();

    const perfumeId = event.currentTarget.dataset.id;

    if (!perfumeId) {
        return;
    }

    this[NavigationMixin.Navigate]({
        type: 'comm__namedPage',
        attributes: {
            name: 'Product_Details__c'
        },
        state: {
            c__recordId: perfumeId
        }
    });
}

handleCardKeydown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.handleViewDetails(event);
    }
}

    // Navigate to Shop through parent event
    handleViewAll() {
        this.dispatchEvent(
            new CustomEvent('viewall', {
                bubbles: true,
                composed: true
            })
        );
    }

    // Handle broken product images
    handleImageError(event) {
        const perfumeId = event.currentTarget.dataset.id;

        this.products = this.products.map(product => {
            if (product.Id === perfumeId) {
                return {
                    ...product,
                    imageUrl: ''
                };
            }

            return product;
        });
    }

    // Retry loading featured perfumes
    handleRetry() {
        this.isLoading = true;
        this.errorMessage = '';

        return getFeaturedPerfumes()
            .then(data => {
                this.products = this.formatProducts(data);
            })
            .catch(error => {
                this.products = [];
                this.errorMessage =
                    'Unable to load fragrances. Please try again.';

                console.error('Retry Error:', error);
            })
            .finally(() => {
                this.isLoading = false;
            });
    }
}
