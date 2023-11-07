let timerStartButton;
let timerPauseButton;
let timerResetButton;
let timer;
let timeDeltaPassed;
let timerRunning;

function setup() {
    //set default values of timer
    timer = 0;
    timeDeltaPassed = 0;
    timerRunning = 0;

    /*
    //create a canvas that's the same size as the user display minus a little in height to compensate for toolbar
    createCanvas(windowWidth, windowHeight-8);
    background(50,50,50);
    */

    //create the button to start timer
    timerStartButton = createButton("Start/Pause");
    timerStartButton.position(15,20);
    timerStartButton.mousePressed(startTimer);

    //create the button to reset timer
    timerResetButton = createButton("Reset");
    timerResetButton.position(250,20);
    timerResetButton.mousePressed(resetTimer);
}

function draw() {
    if (timerRunning == 1) {
        timeDeltaPassed += deltaTime;
    }
    timer = timeDeltaPassed / 1000;
    timer = round(timer, 2);

    document.getElementById("timer").innerHTML = timer;

    /*
    //create some text to show timer
    let timerText = createP(timer);
    timerText.style('font-size', '250%');
    timerText.position(50,0);
    */
}

/*
function mousePressed() {
    print(round(timer, 2));
}
*/

function startTimer() {
    if (timerRunning == 0) {
        timerRunning = 1;
    } else {
        timerRunning = 0;
    }
}

function resetTimer() {
    timerRunning = 0;
    timeDeltaPassed = 0;
    timer = 0;
}