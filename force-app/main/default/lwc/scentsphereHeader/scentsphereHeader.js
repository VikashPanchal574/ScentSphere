import { LightningElement } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';

export default class ScentsphereHeader extends NavigationMixin(LightningElement) {

    searchTerm = '';
    isMenuOpen = false;

    /* Mobile menu */
    toggleMenu() {
        this.isMenuOpen = !this.isMenuOpen;
    }

    closeMenu() {
        this.isMenuOpen = false;
    }

    get navClass() {
        return this.isMenuOpen ? 'navigation open' : 'navigation';
    }

    get menuIcon() {
        return this.isMenuOpen ? '✕' : '☰';
    }

    get menuAriaExpanded() {
        return this.isMenuOpen ? 'true' : 'false';
    }

    /* Common Navigation Method */
    navigateToPage(pageName) {
        this[NavigationMixin.Navigate]({
            type: 'comm__namedPage',
            attributes: {
                name: pageName
            }
        });

        this.closeMenu();
    }

    /* Search */
    handleSearch(event) {
        this.searchTerm = event.target.value;
        console.log('Search perfume:', this.searchTerm);
    }

    /* Home Page */
    handleHome(event) {
        event.preventDefault();
        this.navigateToPage('Home');
    }

    /* Shop Page */
    handleShop(event) {
        event.preventDefault();
        this.navigateToPage('Shop__c');
    }

    /* Future Pages */
    handleCollections(event) {
        event.preventDefault();
        console.log('Collections page coming soon');
    }

    handleGifts(event) {
        event.preventDefault();
        console.log('Gifts page coming soon');
    }

    handleAbout(event) {
        event.preventDefault();
        console.log('About page coming soon');
    }

    handleContact(event) {
        event.preventDefault();
        console.log('Contact page coming soon');
    }

    /* Header Actions */
    handleWishlist() {
        console.log('Wishlist clicked');
    }

    handleCart() {
        console.log('Shopping cart clicked');
    }

    handleLogin() {
        console.log('Sign In clicked');
    }
}
