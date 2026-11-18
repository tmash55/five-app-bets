// Tests run on the screen the game is designed for, so sizes from the theme are the design sizes.
const { Dimensions } = require('react-native');

const design = { width: 844, height: 390, scale: 3, fontScale: 1 };
Dimensions.set({ window: design, screen: design });
