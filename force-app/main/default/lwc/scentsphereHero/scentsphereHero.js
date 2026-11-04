
import { LightningElement } from 'lwc';
import heroImage from '@salesforce/resourceUrl/ScentSphereHero';

export default class ScentsphereHero extends LightningElement {

    heroImage = heroImage;

    handleShopNow() {
        console.log('Shop Now clicked');
    }

    handleExplore() {
        console.log('Explore Collections clicked');
    }
}
