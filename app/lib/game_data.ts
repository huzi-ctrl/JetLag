export type GameSize = 'small' | 'medium' | 'large';

export const QUESTION_DATA = {
    MATCHING: {
        id: 'matching',
        name: 'Matching',
        icon: '🧩',
        draw: 3,
        keep: 1,
        timeLimit: 5,
        desc: 'Does your location match this image/description?',
        questions: {
            all: [
                { label: "Commercial Airport", query: "Airport", size: 'small' },
                { label: "Transit Line", size: 'small' },
                { label: "Station's Name Length", size: 'small' },
                { label: "Street or Path", size: 'small' },
                { label: "2nd Admin Border (County)", size: 'small' },
                { label: "3rd Admin (Municipality | City | Town)", size: 'small' },
                { label: "4th Admin (Borough)", size: 'small' },
                { label: "Mountain", size: 'small' },
                { label: "Landmass", size: 'small' },
                { label: "Park", size: 'small' },
                { label: "Amusement Park", size: 'small' },
                { label: "Zoo", size: 'small' },
                { label: "Aquarium", size: 'small' },
                { label: "Golf Course", size: 'small' },
                { label: "Museum", size: 'small' },
                { label: "Movie Theater", size: 'small' },
                { label: "Hospital", size: 'small' },
                { label: "Library", size: 'small' },
                { label: "Foreign Consulate", size: 'small' }
            ]
        }
    },
    MEASURING: {
        id: 'measuring',
        name: 'Measuring',
        icon: '📏',
        draw: 3,
        keep: 1,
        timeLimit: 5,
        desc: 'Compared to me, are you closer to or further from [Subject]?',
        questions: {
            all: [
                { label: "A Commercial Airport", size: 'small' },
                { label: "A High Speed Train Line", size: 'small' },
                { label: "A Rail Station", size: 'small' },
                { label: "An International Border", size: 'small' },
                { label: "A 1st Admin Border (State)", size: 'small' },
                { label: "A 2nd Admin Border (County)", size: 'small' },
                { label: "4th Admin (Borough)", size: 'small' },
                { label: "Sea Level", size: 'small' },
                { label: "A Body of Water", size: 'small' },
                { label: "A Coastline", size: 'small' },
                { label: "A Mountain", size: 'small' },
                { label: "A Park", size: 'small' },
                { label: "Amusement Park", size: 'small' },
                { label: "Zoo", size: 'small' },
                { label: "Aquarium", size: 'small' },
                { label: "Golf Course", size: 'small' },
                { label: "Museum", size: 'small' },
                { label: "Movie Theater", size: 'small' },
                { label: "Hospital", size: 'small' },
                { label: "Library", size: 'small' },
                { label: "Foreign Consulate", size: 'small' }
            ]
        }
    },
    THERMOMETER: {
        id: 'thermometer',
        name: 'Thermometer',
        icon: '🌡️',
        draw: 2,
        keep: 1,
        timeLimit: 5,
        desc: 'I just traveled (at least) [Distance]. Am I hotter or colder?',
        questions: {
            all: [
                { label: "0.5 miles (805m)", val: 805, size: 'small' },
                { label: "3 miles (4.8km)", val: 4828, size: 'small' },
                { label: "10 miles (16km)", val: 16093, size: 'medium' },
                { label: "50 miles (80km)", val: 80467, size: 'large' }
            ]
        }
    },
    RADAR: {
        id: 'radar',
        name: 'Radar',
        icon: '📡',
        draw: 2,
        keep: 1,
        timeLimit: 5,
        desc: 'Are you within [Radius] of this point?',
        questions: {
            all: [
                { label: "0.25 miles", val: 402, size: 'small' },
                { label: "0.50 miles", val: 805, size: 'small' },
                { label: "1 mile", val: 1609, size: 'small' },
                { label: "3 miles", val: 4828, size: 'small' },
                { label: "5 miles", val: 8046, size: 'small' },
                { label: "10 miles", val: 16093, size: 'medium' },
                { label: "25 miles", val: 40233, size: 'medium' },
                { label: "50 miles", val: 80467, size: 'large' },
                { label: "100 miles", val: 160934, size: 'large' }
            ]
        }
    },
    TENTACLES: {
        id: 'tentacles',
        name: 'Tentacles',
        icon: '🐙',
        draw: 4,
        keep: 2,
        timeLimit: 5,
        desc: 'Of all the [Places] within [Distance] of me, which are you closest to?',
        questions: {
            all: [
                { label: "Museums (1mi)", dist: 1609, type: "museum", size: 'medium' },
                { label: "Libraries (1mi)", dist: 1609, type: "library", size: 'medium' },
                { label: "Movie Theaters (1mi)", dist: 1609, type: "cinema", size: 'medium' },
                { label: "Hospitals (1mi)", dist: 1609, type: "hospital", size: 'medium' },
                { label: "Metro Lines (15mi)", dist: 24140, type: "rail_line", size: 'large' },
                { label: "Zoos (15mi)", dist: 24140, type: "zoo", size: 'large' },
                { label: "Aquariums (15mi)", dist: 24140, type: "aquarium", size: 'large' },
                { label: "Amusement Parks (15mi)", dist: 24140, type: "amusement_park", size: 'large' }
            ]
        }
    },
    PHOTOS: {
        id: 'photos',
        name: 'Photos',
        icon: '📸',
        draw: 1,
        keep: 1,
        timeLimit: 10,
        desc: 'Send a photo of [Subject].',
        questions: {
            all: [
                { label: "A Tree", desc: "Must include the entire tree", size: 'small' },
                { label: "The Sky", desc: "Place phone on ground and shoot directly up", size: 'small' },
                { label: "You (Selfie)", desc: "Selfie mode, arm parallel to the ground, fully extended", size: 'small' },
                { label: "Widest Street", desc: "Must include both sides of the street", size: 'small' },
                { label: "Tallest structure in sightline", desc: "Tallest from current perspective / sightline. Include top and both sides. Top must be in top 1/3rd of frame", size: 'small' },
                { label: "Any building visible from station", desc: "Must stand directly outside transit station entrance. Include roof, both sides, with top in top 1/3rd of frame", size: 'small' },

                { label: "Tallest building visible from station", desc: "Must stand directly outside transit station entrance. Include roof, both sides, with top in top 1/3rd of frame", size: 'medium' },
                { label: "Trace Nearest Street / Path", desc: "Street / Path visible on mapping app. Trace intersection to intersection", size: 'medium' },
                { label: "Two Buildings", desc: "Must include 5'x5' section with three distinct elements", size: 'medium' },
                { label: "Restaurant Interior", desc: "No zoom, must take photo from outside through window", size: 'medium' },
                { label: "Train Platform", desc: "Must include 5'x5' section with three distinct elements", size: 'medium' },
                { label: "Park", desc: "No zoom, phone perpendicular to ground, stand 5' away", size: 'medium' },
                { label: "Grocery Store Aisle", desc: "No zoom, stand at end of aisle, shoot directly down", size: 'medium' },
                { label: "Place of Worship", desc: "Must include 5'x5' section with three distinct elements", size: 'medium' },

                { label: "1/2 Mile of streets traced", desc: "Continuous, 5 turns, no doubling back, N-S Oriented", size: 'large' },
                { label: "Tallest mountain (from station)", desc: "Must be 3x zoom. Top in top 1/3rd", size: 'large' },
                { label: "Biggest body of water in zone", desc: "Max 3x zoom. Include both sides or horizon", size: 'large' },
                { label: "Five buildings", desc: "Must include bottom, and up to four stories", size: 'large' }
            ]
        }
    }
};


export const getAllQuestions = () => {
    const all: any[] = [];
    Object.entries(QUESTION_DATA).forEach(([catKey, catData]) => {
        const catId = catData.id;
        catData.questions.all.forEach((q: any, idx: number) => {
            all.push({
                ...q,
                id: `${catId}_${idx}`, // Synthetic ID
                category: catId,
                question: q.label // Map label to 'question' property for UI
            });
        });
    });
    return all;
};

export const DECK_DATA = {
    TIME: [
        { id: 'time_red', name: 'Time Bonus (Red)', count: 16, tier: { small: 2, medium: 3, large: 5 } },
        { id: 'time_orange', name: 'Time Bonus (Orange)', count: 10, tier: { small: 4, medium: 6, large: 10 } },
        { id: 'time_yellow', name: 'Time Bonus (Yellow)', count: 8, tier: { small: 6, medium: 9, large: 15 } },
        { id: 'time_green', name: 'Time Bonus (Green)', count: 3, tier: { small: 8, medium: 12, large: 20 } },
        { id: 'time_blue', name: 'Time Bonus (Blue)', count: 2, tier: { small: 12, medium: 18, large: 30 } }
    ],
    POWER: [
        { id: 'pwr_random', name: 'Randomize', count: 8, desc: 'Randomize the questions.' },
        { id: 'pwr_veto', name: 'Veto', count: 4, desc: 'Veto a question.' },
        { id: 'pwr_discard1', name: 'Discard 1 Draw 2', count: 8, desc: 'Discard 1 card to draw 2.' },
        { id: 'pwr_discard2', name: 'Discard 2 Draw 3', count: 8, desc: 'Discard 2 cards to draw 3.' },
        { id: 'pwr_duplicate', name: 'Duplicate', count: 5, desc: 'Double the effect of next card.' },
        { id: 'pwr_expand', name: 'Draw 1 Expand 1', count: 4, desc: 'Draw 1 and Expand radius.' },
        { id: 'pwr_move', name: 'Move', count: 1, desc: 'Move freely.' }
    ],
    CURSES: [
        { id: 'curse_zoo', name: 'Curse Of The Zoologist', desc: 'Take a photo of a wild fish, bird, mammal, reptile, amphibian or bug. The seeker(s) must take a picture of a wild animal in the same category before asking another question.', cost: 'A photo of an animal', inputConfig: { type: 'text', label: 'Animal Description', imageRequired: true }, blocking: true, completable: true },
        { id: 'curse_tourist', name: 'Curse Of The Unguided Tourist', desc: 'Send the seeker(s) an unzoomed google Street View image from a street within 500ft of where they are now. The shot has to be parallel to the horizon and include at least one human-built structure other than a road. Without using the internet for research, they must find what you sent them in real life before they can use transportation or ask another question. They must send a picture the hiders for verification.', cost: 'Seker(s) must be outside', inputConfig: { type: 'text', label: 'Instructions/Link', imageRequired: true }, blocking: true, completable: true },
        { id: 'curse_tumble', name: 'Curse Of The Endless Tumble', desc: 'Seekers must roll a die at least 100ft and have it land on a 5 or a 6 before they can ask another question. The die must roll the full distance, unaided, using only the momentum from the initial throw and gravity to travel the 100ft. If the seekers accidentally hit someone with a die you are awarded a {val} minute bonus', cost: 'Roll a die. If its 5 or 6 this card has no effect.', tiers: { small: '10', medium: '20', large: '30' }, blocking: true, completable: true },
        { id: 'curse_hangman', name: 'Curse Of The Hidden Hangman', desc: 'Before asking another question or boarding another form of transportation, seeker(s) must be the hider(s) in game of hangman.', cost: 'Discard 2 cards', discardCost: 2, blocking: true, completable: true },
        { id: 'curse_chalice', name: 'Curse Of The Overflowing Chalice', desc: 'For the next three questions, you may draw (not keep) an additional card when drawing from the hider deck', cost: 'Discard a card', discardCost: 1 },
        { id: 'curse_agent', name: 'Curse Of The Mediocre Travel Agent', desc: 'Choose any publicly-accessible place within {dist} of the seeker(s) current location. They cannot currently be on transit. They must go there, and spend at least {time} there, before asking another question. They must send you at least three photos of them enjoying their vacation, and procure an object to bring you as souvenir. If this souvenir is lost before they can get to you, you are awarded and extra {bonus}.', cost: 'Destination must be further from you than the seekers are.', inputConfig: { type: 'location', label: 'Search Destination' }, tiers: { small: '0.25mi / 5min / 30min', medium: '0.25mi / 5min / 45min', large: '0.50mi / 10min / 60min' }, blocking: true, completable: true, failed_condition: true, failed_penalty: 30 },
        { id: 'curse_car', name: 'Curse Of The Luxury Car', desc: 'Take a photo of a car. The seekers must take a photo of a more expensive car before asking another question.', cost: 'A photo of a car', inputConfig: { type: 'text', label: 'Car Model', imageRequired: true }, blocking: true, completable: true },
        { id: 'curse_uturn', name: 'Curse Of The U-Turn', desc: 'Seeker(s) must disembark their current mode of transportation at the next station (as long as that station is served by another form of transit in the next {time} hours', cost: 'Seekers must be heading the wrong way. (Their next station is further from you then they are.)', tiers: { small: '0.5', medium: '0.5', large: '1' }, completable: true },
        { id: 'curse_troll', name: 'Curse Of The Bridge Troll', desc: 'The seekers must ask their next question from under a bridge', cost: 'Seekers Must be at least {dist}mi from you', tiers: { small: '1', medium: '5', large: '30' }, blocking: true, completable: true },
        { id: 'curse_water', name: 'Curse Of Water Weight', desc: 'Seeker(s) must acquire and carry at least 2 liters of liquid per seeker for the rest of your run. They cannot ask another question until they have acquired the liquid. The water may be distributed between seeker as they see fit. If the liquid is lost or abandoned at any point the hider is awarded a {val} minute bonus', cost: 'Seekers must be within 1,000ft of a body of water', tiers: { small: '30', medium: '30', large: '60' }, blocking: true, failed_condition: true, failed_penalty: 30 },
        { id: 'curse_door', name: 'Curse Of The Jammed Door', desc: 'For the next {dur}, whenever the seeker(s) want to pass through a doorway into a building, business, train, or other vehicle they must first roll 2 dice. If they do not roll a 7 or higher they cannot enter that space (including through other doorways) any given doorway can be reattempted after {retry}.', cost: 'Discard 2 cards', discardCost: 2, tiers: { small: '0.5h / 5m', medium: '1h / 10m', large: '3h / 15m' }, completable: true, failed_condition: true, failed_penalty: 5 },
        { id: 'curse_cairn', name: 'Curse Of The Cairn', desc: 'You have one attempt to stack as many rocks on top of each other as you can in a freestanding tower. Each rock may only touch one other rock. Once you have added a rock to the tower it may not be removed. Before adding another rock, the tower must stand for at least 5 seconds. If at any point any rock other then the base rock touches the ground, your tower has fallen. Once your tower falls tell the seekers how many rocks high your tower was when it last stood for five seconds. The seekers must then construct a rock tower of the same number of rucks, under the same parameters before asking another question. If their tower falls they must restart. The rocks must be found in nature and both teams must disperse the rocks after building.', cost: 'Build a rock tower', inputConfig: { type: 'number', label: 'Rock Tower Height (rocks)' }, blocking: true, completable: true },
        { id: 'curse_urban', name: 'Curse Of The Urban Explorer', desc: 'For the rest of the run seekers cannot ask question when they are on transit or in a train station', cost: 'Discard 2 cards', discardCost: 2 },
        { id: 'curse_consumer', name: 'Curse Of The Impressionable Consumer', desc: 'Seekers must enter and gain admission (if applicable) to a location or buy a product that they saw an advertisement for before asking another question. This advertisement musts be found out in the world and must be at least 100ft from the product or location itself.', cost: 'The seekers next question is free', blocking: true, completable: true },
        { id: 'curse_egg', name: 'Curse Of The Egg Partner', desc: 'Seeker(s) must acquire an egg before asking another question. This egg is now treated as an official team member of the seekers. If any team members are abandoned or killed (defined as crack in the eggs case) before the end of your run you are awarded an extra {val} minutes. This course cannot be played during the endgame.', cost: 'Discard two cards', discardCost: 2, tiers: { small: '30', medium: '45', large: '60' }, blocking: true, failed_condition: true, failed_penalty: 30 },
        { id: 'curse_cuisine', name: 'Curse Of The Distant Cuisine', desc: 'Find a restaurant within your zone that explicitly serves food from a specific foreign country. The seekers must visit a restaurant serving food from a country that is equal or great distance away before asking another question', cost: 'You must be at the restaurant', inputConfig: { type: 'text', label: 'Restaurant Name/Location' }, blocking: true, completable: true },
        { id: 'curse_right', name: 'Curse Of The Right Turn', desc: 'For the next {dur} minutes the seekers can only turn right at any street intersection. If at any point they find themselves in dead end where they cannot continue forward or turn right for another 1,000ft they must do a full 180. A right turn is defined as a road at any angle that veers to the right of the seekers', cost: 'Discard a card', discardCost: 1, tiers: { small: '20', medium: '40', large: '60' }, completable: true },
        { id: 'curse_labyrinth', name: 'Curse Of The Labyrinth', desc: 'Spend up to {val} minutes drawing a solvable maze and send a photo of it to the seekers. You cannot use the internet to research maze designs. The seekers musts solve the maze before asking another question.', cost: 'Draw a maze', inputConfig: { type: 'text', label: 'Maze Description', imageRequired: true }, tiers: { small: '10', medium: '20', large: '30' }, blocking: true, completable: true },
        { id: 'curse_bird', name: 'Curse Of The Bird Guide', desc: 'You have one chance to film a bird for as long as possible. Up to {val} minutes straight, if at any point the bird leaves the frame your timer is stopped. The seekers must then film a bird for the same amount of time or longer', cost: 'Film a bird', tiers: { small: '5', medium: '10', large: '15' }, blocking: true, completable: true },

        { id: 'curse_lemon', name: 'Curse Of The Lemon Phylactery', desc: 'Before asking another question the seeker(s) must each find a lemon and affix it to their outermost layer of their clothes or skin. If at any point one of these lemons is no longer touching a seeker you are awarded {val} minutes. This curse cannot be played during the endgame.', cost: 'Discard a powerup card', discardCost: 1, discardReq: { count: 1, type: 'POWER' }, tiers: { small: '30', medium: '45', large: '60' }, blocking: true, failed_condition: true, failed_penalty: 30 },
        { id: 'curse_brain', name: 'Curse Of The Drained Brain', desc: 'Choose three questions in different categories. The seekers cannot ask those questions for the rest of the run.', cost: 'Discard your hand', discardHand: true },
        { id: 'curse_ransom', name: 'Curse Of The Ransom Note', desc: 'The next question that the seekers ask must be composed of words and letters cut out of any printed material. The question must be coherent and include at least 5 words.', cost: 'Spell out "Ransom Note" as a ransom note (without using this card)', inputConfig: { type: 'text', label: 'Ransom Note Text', imageRequired: true } },
        { id: 'curse_gambler', name: 'Curse Of The Gambler\'s Feet', desc: 'For the next {dur} minutes seekers must roll a die before they take any steps in any direction, they may take that many steps before rolling again', cost: 'Roll a die if its even number this curse has no effect', tiers: { small: '20', medium: '40', large: '60' } }
    ]
};
