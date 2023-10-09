let text1;
let text2;
let text1Default = ' ';
let text2Default = ' ';
let sliderCircleSize;
let sliderCircleColour;
let text1Box;
let text1Colour;
let text2Box;
let text2Colour;
let bgColour;
let rainbowMode;
let showSecretTextChance;
let pause = 0;
let key1;
let key2;
let key3;
let key4;
let key5;

function setup() {
    //create a canvas that's 400px in width and 400px in height
    createCanvas(displayWidth-25, displayHeight-150);
    //create a slider that changes Circle Size
    sliderCircleSize = createSlider(0, 160, 160);
    sliderCircleSize.position(400, 295);
    //create a colour picker for the colour of the circle
    sliderCircleColour = createColorPicker('#ffffff');
    sliderCircleColour.position(450,320);
    //create first input for the text that populates the screen
    text1Box = createInput('');
    text1Box.position(900,305);
    //create colour picker for first text
    text1Colour = createColorPicker('#ffffff');
    text1Colour.position(1100,295);
    //create second input for the text that populates the screen
    text2Box = createInput('');
    text2Box.position(900,330);
    //create colour picker for second text
    text2Colour = createColorPicker('#ffffff');
    text2Colour.position(1100,330);
    //create colour picker for background colour
    bgColour = createColorPicker('#000000');
    bgColour.position(450, 450);
    //set rainbowMode to false at start
    rainbowMode = 0;
    //set the background color to a random RGB value up to 255
    //background(random(256), random(256), random(256));
    background(bgColour.value());
    text1 = text1Default;
    text2 = text2Default;
}

function draw() {
    if (pause === 0) {
        if (mouseIsPressed === true) {
            //create a random coloured circle at the location of the mouse
            noStroke();
            if (rainbowMode === 0) {
                fill(sliderCircleColour.value());
            } else {
                fill(random(256), random(256), random(256));
            }
            circle(mouseX, mouseY, sliderCircleSize.value());
        }
        //write some text on a random position within the box
        textSize(12);
        fill(text1Colour.value());
        text(text1, random(-50, displayWidth), random(-50, displayHeight));
        fill(text2Colour.value());
        text(text2, random(-50, displayWidth), random(-50, displayHeight));
        
        if (text1 != ' ' || text2 != ' ') {
            showSecretTextChance = random(0, 1001);
            if (showSecretTextChance >= 1000) {
                text('YOU WILL DIE.', random(-50, displayWidth), random(-50, displayHeight));
            }
        }
    }
}

function keyPressed() {
    key5 = key4;
    key4 = key3;
    key3 = key2;
    key2 = key1;
    key1 = keyCode;
    if (keyCode === 46) { //reset the program when del is pressed
        reset();
    } else if (keyCode === 27) { //toggle the pause bool with Escape
        togglePause();
    } else if (keyCode === 13) { //upon keypress enter, set the text to show
        setText();
    } else if (keyCode === 49) { //pressing 1 will toggle rainbow mode
        secretRainbowMode();
    } else if (key5 == 78 && key4 == 79 && key3 == 82 && key2 == 65 && key1 == 72) { //this one does nothing
        norahMode();
    }
}

function reset() {
    //this code will be executed when you click your left mouse button
    clear();
    rainbowMode = 0;
    //set the background color to a random RGB value up to 255
    //background(random(256), random(256), random(256));
    background(bgColour.value());
    //reset the pause bool on reset
    if (pause === 1) {
        pause = 0;
    }
}

function togglePause() {
    if (pause === 0) {
        pause = 1;
    } else {
        pause = 0;
    }
}

function setText() {
    if (text1Box.value() != '') {
        text1 = text1Box.value();
    } else {
        text1 = ' ';
    }
    if (text2Box.value() != '') {
        text2 = text2Box.value();
    } else {
        text2 = ' ';
    }
}

function secretRainbowMode() {
    if (rainbowMode === 0) {
        rainbowMode = 1;
    } else {
        rainbowMode = 0;
    }
}

function norahMode() {
    clear();
    background(0,0,0);
    text1 = 'Norah';
    text2 = 'Norah';
}
//function mousePressed() {}