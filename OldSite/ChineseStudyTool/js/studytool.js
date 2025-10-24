//all the words needed for studying
const word0 = ['Tomatoes','Xo hong sho','Xī hóng shì','西红柿'];
const word1 = ['Carrot','Hu luo bo','Hú luó bo','胡萝卜'];
const word2 = ['Cucumber','Huang gua','Huáng guā','黄瓜'];
const word3 = ['Potato','Tu dou','Tǔ dòu','土豆'];
const word4 = ['Steamed Bun','Bao zi','Bāo zi','包子'];
const word5 = ['Dumpling','Jiao zi','Jiǎo zi','饺子'];
const word6 = ['Cooked Rice','Mi fan','Mǐ fàn','米饭'];
const word7 = ['Noodle','Mian tiao','Miàn tiáo','面条'];
const word8 = ['Teacher','Lao shi','Lǎo shī','老师'];
const word9 = ['Student','Xue sheng','Xué shēng','学生'];
const word10 = ['Doctor','Dai fu','Dài fu','大夫'];
const word11 = ['Nurse','Hu shi','Hù shì','护士'];
const word12 = ['Chef','Chu shi','Chú shī','厨师'];
const word13 = ['Spoon','Shao zi','Sháo zi','勺子'];
const word14 = ['Fork','Cha zi','Chā zi','叉子'];
const word15 = ['Knife','Dao zi','Dāo zi','刀子'];
const word16 = ['Table','Zhuo zi','Zhuō zi','桌子'];
const word17 = ['Plate','Pan zi','Pán zi','盘子'];
const word18 = ['Cup','Bei zi','Bēi zi','杯子'];
const word19 = ['Bed','Chuang','Chuáng','床'];
const word20 = ['Sofa','Sha fa','Shā fā','沙发'];
const word21 = ['Cabinet','Gui zi','Guì zi','柜子'];
const word22 = ['Chair','Yi zi','Yǐ zi','椅子'];
const word23 = ['Ice Lolly','Bing gun','Bīng gùn','冰棍'];
const word24 = ['Sunflower Seed','Gua zi','Guā zǐ','瓜子'];
const word25 = ['Cup Lid','Beizi Gai','Bēizi Gài','杯子盖'];
const word26 = ['Gold Fish','Jin yu','Jīn yú','金鱼'];
const word27 = ['Singing','Chang ge','Chàng gē','唱歌'];

//multi dimensional array containing all above words
const words = [word0,word1,word2,word3,word4,word5,word6,word7,word8,word9,word10,word11,word12,word13,word14,word15,word16,word17,word18,word19,word20,word21,word22,word23,word24,word25,word26,word27];

//mode buttons
let pinyinButton;
let pinyinTonesButton;
let chincharButton;

//functional variables
let randomizeButton;
let mode = 1;
let resultsButton;
let usedWords = ['99','99','99','99','99'];
let randomNum = 0;
let questionName;
let inputText;
let answerElement;

function setup() {
    //Create and set randomizer button
    randomizeButton = createButton("Randomize");
    randomizeButton.position(windowWidth - windowWidth/1.5,530);
    randomizeButton.mousePressed(randomizer);

    //Create and set Check Results button
    resultsButton = createButton("Check Results");
    resultsButton.position(windowWidth - windowWidth/2,530);
    resultsButton.mousePressed(checkresults);
    randomizer();

    //Create and set Yin Pin button
    pinyinButton = createButton("Pinyin");
    pinyinButton.position(windowWidth - windowWidth/1.75,215);
    pinyinButton.mousePressed(modeSwitchPinyin);

    //Create and set Yin Pin w/ Tones button
    pinyinTonesButton = createButton("Pinyin w/ Tones");
    pinyinTonesButton.position(windowWidth - windowWidth/2,215);
    pinyinTonesButton.mousePressed(modeSwitchPinyinTones);

    //Create and set Chinese Char button
    chincharButton = createButton("Chinese Char");
    chincharButton.position(windowWidth - windowWidth/2.25,215);
    chincharButton.mousePressed(modeSwitchChinChar);
}

function draw() {
    //Keep Buttons Centered
    randomizeButton.position(windowWidth - windowWidth/1.58,530);
    resultsButton.position(windowWidth - windowWidth/2.35,530);
    pinyinButton.position(windowWidth - windowWidth/1.75,215);
    pinyinTonesButton.position(windowWidth - windowWidth/1.9125,215);
    chincharButton.position(windowWidth - windowWidth/2.25,215);
}

function randomizer() {
    //reset used words
    usedWords = ['99','99','99','99','99'];
    for (let i=0; i<5; i++) {
        //pick a random word from list of words
        randomNum = round(random(0,27));
        while (usedWords.includes(randomNum)) {
            //make sure not to repeat words
            randomNum = round(random(0,27));
        }
        //add word to used word list
        usedWords[i] = randomNum;
        //increment for use in naming scheme
        let nr = i+1;
        //set proper name to find right html element
        questionName = "Word" + nr + "Text";
        console.debug(words[randomNum][0]); //show word in english
        console.debug(words[randomNum][mode]); //show correct translation
        //set the text and title of element to randomly picked word
        document.getElementById(questionName).title = words[randomNum][0];
        document.getElementById(questionName).innerHTML = words[randomNum][0];

        //reset inputs
        document.getElementById("Input" + nr).value = "";

        //reset answers
        answerElement = document.getElementById("Answer" + nr);
        answerElement.title = " ";
        answerElement.innerHTML = " ";
        answerElement.style.color = "white";
    }
}

function checkresults() {
    for (let i=0; i<5; i++) {
        let nr = i + 1;
        //Set correct name and get answer for answer checking
        let inputname = "Input" + nr;
        inputText = document.getElementById(inputname).value;
        //console.debug(inputText);
        //Get answer text field
        answerElement = document.getElementById("Answer" + nr);
        //Check answer against list and display result
        if (words[usedWords[i]][mode].toLowerCase().trim().normalize() == inputText.toLowerCase().trim().normalize()) {
            answerElement.title = words[usedWords[i]][mode].toLowerCase().trim().normalize();
            answerElement.innerHTML = words[usedWords[i]][mode].toLowerCase().trim().normalize();
            answerElement.style.color = "green";
        } else {
            answerElement.title = words[usedWords[i]][mode].toLowerCase().trim().normalize();
            answerElement.innerHTML = words[usedWords[i]][mode].toLowerCase().trim().normalize();
            answerElement.style.color = "red";
        }
    }
}

function modeSwitchPinyin() {
    document.getElementById("ModeTitle").title = "Pinyin";
    document.getElementById("ModeTitle").innerHTML = "Pinyin";
    mode = 1;
}

function modeSwitchPinyinTones() {
    document.getElementById("ModeTitle").title = "Pinyin w/ Tones";
    document.getElementById("ModeTitle").innerHTML = "Pinyin w/ Tones";
    mode = 2;
}

function modeSwitchChinChar() {
    document.getElementById("ModeTitle").title = "Chinese Characters";
    document.getElementById("ModeTitle").innerHTML = "Chinese Characters";
    mode = 3;
}