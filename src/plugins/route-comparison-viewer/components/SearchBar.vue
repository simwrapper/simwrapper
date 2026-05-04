<template>
    <div class="search-bar-cols">
        <div class="search-bar-col">
            <input type="text" placeholder="Search Origin..." v-on:input="writeTextOrigin"
                class="search-input-origin" />
            <div v-if="searchResultsOrigin.length > 0" class="search-results-origin">
                <div v-for="result in searchResultsOrigin"
                    :key="result.properties.name + result.properties.city + result.properties.country + Math.random()"
                    class="search-result-origin" @click="emitOrigin(result)">
                    {{ (result.properties.street || result.properties.name) + " " + (result.properties.housenumber ||
                        '') +
                        " "
                        +
                        (result.properties.postcode || '') + " " + result.properties.city + " " + result.properties.country
                    }}
                </div>
            </div>
        </div>
        <div class="search-bar-col">
            <input type="text" placeholder="Search Destination" v-on:input="writeTextDestination"
                class="search-input-destination" />
            <div v-if="searchResultsDestination.length > 0" class="search-results-destination">
                <div v-for="result in searchResultsDestination"
                    :key="result.properties.name + result.properties.city + result.properties.country + Math.random()"
                    class="search-result-destination" @click="emitDestination(result)">
                    {{ (result.properties.street || result.properties.name) + " " + (result.properties.housenumber ||
                        '') +
                        " "
                        +
                        (result.properties.postcode || '') + " " + result.properties.city + " " + result.properties.country
                    }}
                </div>
            </div>
        </div>
    </div>


</template>

<script lang="ts">

import { ref } from "vue";

interface AddressFeature {
    properties: {
        name?: string;
        street?: string;
        housenumber?: string;
        postcode?: string;
        city: string;
        country: string;
    };
    geometry: {
        coordinates: [number, number];
    };
}

export default {
    name: 'SearchBar',
    data() {
        return {
            inputOrigin: ref(''),
            inputDestination: ref(''),
            searchResultsOrigin: ref<AddressFeature[]>([]),
            searchResultsDestination: ref<AddressFeature[]>([])
        }
    },
    methods: {
        writeTextOrigin(event: any) {
            this.inputOrigin = (event.target as HTMLInputElement).value
            if (this.inputOrigin.length > 5) {
                this.fetchAddressSuggestionsOrigin(this.inputOrigin)
            }
        },

        writeTextDestination(event: any) {
            this.inputDestination = (event.target as HTMLInputElement).value
            if (this.inputDestination.length > 5) {
                this.fetchAddressSuggestionsDestination(this.inputDestination)
            }
        },

        fetchAddressSuggestionsOrigin(query: string) {
            fetch(`https://photon.komoot.io/api/?q=${query}`)
                .then(response => response.json())
                .then(data => {
                    this.searchResultsOrigin = data.features || [];
                    console.log('Address suggestions:', this.searchResultsOrigin);
                })
                .catch(error => {
                    console.error('Error fetching address suggestions:', error);
                });
        },

        fetchAddressSuggestionsDestination(query: string) {
            fetch(`https://photon.komoot.io/api/?q=${query}`)
                .then(response => response.json())
                .then(data => {
                    this.searchResultsDestination = data.features || [];
                    console.log('Address suggestions:', this.searchResultsDestination);
                })
                .catch(error => {
                    console.error('Error fetching address suggestions:', error);
                });
        },

        emitOrigin(result: any) {
            console.log('emitting recenter-map event with origin coordinates:', result.geometry.coordinates);
            const originInput = document.querySelector('.search-input-origin') as HTMLInputElement;
            if (originInput) {
                originInput.value = (result.properties.street || result.properties.name) + " " + (result.properties.housenumber || '') + " "
                    +
                    (result.properties.postcode || '') + " " + result.properties.city + " " + result.properties.country; // fill with selection
            }

            this.$emit('omit-origin', result.geometry.coordinates);
            this.searchResultsOrigin = []; // Clear search results after selection

        },

        emitDestination(result: any) {
            console.log(result)
            console.log('emitting recenter-map event with destination coordinates:', result.geometry.coordinates);
            const destinationInput = document.querySelector('.search-input-destination') as HTMLInputElement;
            if (destinationInput) {
                destinationInput.value = (result.properties.street || result.properties.name) + " " + (result.properties.housenumber || '') + " "
                    +
                    (result.properties.postcode || '') + " " + result.properties.city + " " + result.properties.country; // fill with selection
            }

            this.$emit('omit-destination', result.geometry.coordinates);
            this.searchResultsDestination = []; // Clear search results after selection

        }
    }


}

</script>

<style scoped>
.search-input-origin,
.search-input-destination {
    display: block;
    width: 350px;
    padding: 5px 5px;
    background: white url("assets/search-icon.svg") no-repeat 15px center;
    background-size: 15px 15px;
    /* font-size: 16px; */
    border: none;
    border-radius: 5px;
    box-shadow: rgba(50, 50, 93, 0.25) 0px 2px 5px -1px,
        rgba(0, 0, 0, 0.3) 0px 1px 3px -1px;
}

.search-results-origin,
.search-results-destination {
    position: absolute;
    text-align: left;
    width: 350px;
    margin-top: 60px;
    background: white;
    border-radius: 5px;
    box-shadow: rgba(50, 50, 93, 0.25) 0px 2px 5px -1px,
        rgba(0, 0, 0, 0.3) 0px 1px 3px -1px;
}

.search-results-origin .search-result,
.search-results-destination .search-result {
    margin-top: 25px;
    border-bottom: 1px solid #eee;
}

search-bar-col {
    position: relative;
    display: inline-block;
    margin-right: 10px;
}

search-bar-cols {
    position: absolute;
    top: 0px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
}
</style>
