
import { LightningElement, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';

import getFeaturedPerfumes
    from '@salesforce/apex/FeaturedFragrancesController.getFeaturedPerfumes';

export default class FeaturedFragrances extends NavigationMixin(LightningElement) {

    products = [];
    isLoading = true;
    errorMessage = '';

    // Controls whether all featured products are displayed
    showAllProducts = false;

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
            this.showAllProducts = false;
            this.errorMessage = '';
            this.isLoading = false;

        } else if (error) {
            this.products = [];
            this.showAllProducts = false;
            this.errorMessage =
                'Unable to load fragrances. Please try again.';
            this.isLoading = false;

            console.error('Featured Perfumes Error:', error);
        }
    }

    // Initially display only 4 products
    get visibleProducts() {
        return this.showAllProducts
            ? this.products
            : this.products.slice(0, 4);
    }

    // Show View All button only when more than 4 products exist
    get showViewAll() {
        return this.products.length > 4 && !this.isLoading;
    }

    // Dynamic button label
    get viewAllLabel() {
        return this.showAllProducts
            ? 'Show Less'
            : 'View All Featured Fragrances';
    }

    // Dynamic button arrow
    get viewAllIcon() {
        return this.showAllProducts ? '↑' : '→';
    }

    get hasProducts() {
        return this.products.length > 0 && !this.isLoading;
    }

    get showEmpty() {
        return !this.isLoading &&
            !this.errorMessage &&
            this.products.length === 0;
    }

    // Toggle between 4 products and all featured products
    handleViewAll() {
        this.showAllProducts = !this.showAllProducts;
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

    // Keyboard navigation
    handleCardKeydown(event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.handleViewDetails(event);
        }
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
        this.showAllProducts = false;

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
