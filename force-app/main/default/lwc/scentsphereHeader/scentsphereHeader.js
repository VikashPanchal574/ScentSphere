
import { LightningElement, wire } from 'lwc';

import {
    NavigationMixin,
    CurrentPageReference
} from 'lightning/navigation';

import {
    MessageContext,
    subscribe,
    unsubscribe,
    APPLICATION_SCOPE
} from 'lightning/messageService';

import isGuestUser from '@salesforce/user/isGuest';
import logoResource from '@salesforce/resourceUrl/ScentSphereLogo';

import getWishlistPerfumeIds
    from '@salesforce/apex/WishlistController.getWishlistPerfumeIds';

import WISHLIST_UPDATE
    from '@salesforce/messageChannel/WishlistUpdate__c';


export default class ScentsphereHeader extends NavigationMixin(LightningElement) {

    searchTerm = '';
    isMenuOpen = false;

    isGuest = isGuestUser;
    logoUrl = logoResource;

    wishlistCount = 0;
    subscription = null;

    // Current Salesforce page reference
    @wire(CurrentPageReference)
    pageReference;

    // Subscribe to Wishlist Updates
    @wire(MessageContext)
    wiredMessageContext(context) {

        if (context && !this.subscription) {

            this.subscription = subscribe(
                context,
                WISHLIST_UPDATE,
                (message) => this.handleWishlistUpdate(message),
                { scope: APPLICATION_SCOPE }
            );
        }
    }

    // Initial wishlist count
    connectedCallback() {

        if (!this.isGuest) {
            this.loadWishlistCount();
        }
    }

    // Unsubscribe when component is removed
    disconnectedCallback() {

        if (this.subscription) {
            unsubscribe(this.subscription);
            this.subscription = null;
        }
    }

    // Fetch latest wishlist count
    async loadWishlistCount() {

        if (this.isGuest) {
            this.wishlistCount = 0;
            return;
        }

        try {

            const perfumeIds = await getWishlistPerfumeIds();
            this.wishlistCount = perfumeIds.length;

        } catch (error) {

            console.error('Wishlist count error:', error);
            this.wishlistCount = 0;
        }
    }

    // Receive wishlist updates from other components
    handleWishlistUpdate(message) {

        if (message) {
            this.loadWishlistCount();
        }
    }

    // Wishlist badge label
    get wishlistCountLabel() {

        return this.wishlistCount > 99
            ? '99+'
            : String(this.wishlistCount);
    }

    // Hide Header on Authentication Pages
    get showHeader() {

        const path = window.location.pathname.toLowerCase();

        const authPages = [
            '/selfregister',
            '/login',
            '/forgotpassword'
        ];

        return !authPages.some(page => path.endsWith(page));
    }

    // Detect Current Salesforce Page
    get currentPage() {

        const pageName = this.pageReference?.attributes?.name;

        // About and Contact share the same page
        if (pageName === 'About_Contact__c') {

            return this.pageReference?.state?.c__section === 'contact'
                ? 'contact'
                : 'about';
        }

        const pageMap = {
            'Home': 'home',
            'Shop__c': 'shop',
            'Collections__c': 'collections',
            'Shopping_Cart__c': 'cart',
            'My_Wishlist__c': 'wishlist'
        };

        return pageMap[pageName] || '';
    }

    // Active Navigation Classes
    get homeClass() {
        return this.getNavClass('home');
    }

    get shopClass() {
        return this.getNavClass('shop');
    }

    get collectionsClass() {
        return this.getNavClass('collections');
    }

    get giftsClass() {
        return this.getNavClass('gifts');
    }

    get aboutClass() {
        return this.getNavClass('about');
    }

    get contactClass() {
        return this.getNavClass('contact');
    }

    getNavClass(page) {

        return this.currentPage === page
            ? 'nav-link active'
            : 'nav-link';
    }

    // Mobile Menu
    toggleMenu() {
        this.isMenuOpen = !this.isMenuOpen;
    }

    closeMenu() {
        this.isMenuOpen = false;
    }

    get navClass() {
        return this.isMenuOpen
            ? 'navigation open'
            : 'navigation';
    }

    get menuIcon() {
        return this.isMenuOpen ? '✕' : '☰';
    }

    get menuAriaExpanded() {
        return this.isMenuOpen ? 'true' : 'false';
    }

    // Common Navigation
    navigateToPage(pageName) {

        this[NavigationMixin.Navigate]({

            type: 'comm__namedPage',

            attributes: {
                name: pageName
            }
        });

        this.closeMenu();
    }

    // Navigate to About or Contact section
    navigateToSection(sectionName) {

        this[NavigationMixin.Navigate]({

            type: 'comm__namedPage',

            attributes: {
                name: 'About_Contact__c'
            },

            state: {
                c__section: sectionName
            }
        });

        this.closeMenu();
    }

    // Search
    handleSearch(event) {

        this.searchTerm = event.target.value;

        console.log('Search perfume:', this.searchTerm);
    }

    // Home
    handleHome(event) {

        event.preventDefault();
        this.navigateToPage('Home');
    }

    // Shop
    handleShop(event) {

        event.preventDefault();
        this.navigateToPage('Shop__c');
    }

    // Collections
    handleCollections(event) {

        event.preventDefault();
        this.navigateToPage('Collections__c');
    }

    // Gifts
    handleGifts(event) {

        event.preventDefault();
        this.closeMenu();

        console.log('Gifts page coming soon');
    }

    // About - Navigate to top section
    handleAbout(event) {

        event.preventDefault();
        this.navigateToSection('about');
    }

    // Contact - Navigate to Contact form section
    handleContact(event) {

        event.preventDefault();
        this.navigateToSection('contact');
    }

    // Wishlist
    handleWishlist() {

        if (this.isGuest) {
            this.handleLogin();
            return;
        }

        this.navigateToPage('My_Wishlist__c');
    }

    // Shopping Cart
    handleCart() {
        this.navigateToPage('Shopping_Cart__c');
    }

    // Salesforce Experience Cloud Login
    handleLogin() {

        this[NavigationMixin.Navigate]({

            type: 'comm__loginPage',

            attributes: {
                actionName: 'login'
            }
        });

        this.closeMenu();
    }

    // My Account
    handleMyAccount() {
        this.navigateToPage('My_Account__c');
    }
}
