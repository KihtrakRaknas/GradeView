const puppeteer = require('puppeteer');
const $ = require('cheerio');
const express = require('express')
const bodyParser = require('body-parser');
const weightingObj = require('./classWeightingOutput.json')
const Fuse = require('fuse.js')
const NodeRSA = require('node-rsa');
const key = new NodeRSA({b: 512});
const keysObj = require('./secureContent/keys')
const bwipjs = require('bwip-js');
const { Expo } = require('expo-server-sdk')
key.importKey(keysObj.public, 'pkcs1-public-pem');
key.importKey(keysObj.private, 'pkcs1-private-pem');

let expo = new Expo();

var options = {
  shouldSort: true,
  includeScore: true,
  threshold: 0.6,
  location: 0,
  distance: 100,
  maxPatternLength: 100,
  minMatchCharLength: 2,
  keys: [
    "Name"
  ]
};
var fuse = new Fuse(weightingObj, options);

//console.log(getData('10012734@sbstudents.org','Sled%2#9'));


const app = express()
const port = process.env.PORT || 3000
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

var currentUsers=[];

const admin = require('firebase-admin');

var serviceAccount = require('./secureContent/serviceKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

var db = admin.firestore();

app.get('/', async (req, res) => {
  const username = req.body.username;//'10012734'
  const password = req.body.password; //'Sled%2#9'
  console.log(req.body);
  
  var userRef = db.collection('users').doc(username);

  userRef.get()
  .then(doc => {
      if (!doc.exists) {
        console.log('No such document!');
        console.log("cached object not found")
        res.json({"Status":"loading..."})
        updateGrades(username,password,userRef).then(() => {
          //res.end();
        }).catch(err => {
          console.log('Error updating grades', err);
        })
        updateLastAlive(username)
      } else {
        db.collection('userTimestamps').doc(username).get().then(docTime => {
          if(!docTime.exists || (docTime.exists && docTime.data()["Timestamp"] < new Date().getTime() - (1000*60*60*24*30))){
            //This is a user who has started using the app after a long time
            console.log("updating chache after lack of usage")
            updateGrades(username,password,userRef).then(() => {
              //res.end();
            }).catch(err => {
              console.log('Error updating grades', err);
            })
            res.json({"Status":"loading..."})
          }else{
            console.log("returning cached object")
            res.json(doc.data())
          }
        }).then(()=>{
          updateLastAlive(username)
        }).catch((err)=>{
          console.log(err)
        })
      }
    })
    .catch(err => {
      console.log('Error getting document', err);
    });
	})

	app.post('/', async (req, res) => {
    const username = req.body.username;//'10012734'
    const password = req.body.password; //'Sled%2#9'
    console.log(req.body);
    
    var userRef = db.collection('users').doc(username);
  
    userRef.get()
    .then(doc => {
        if (!doc.exists) {
          console.log('No such document!');
          console.log("cached object not found")
          res.json({"Status":"loading..."})
          updateGrades(username,password,userRef).then(() => {
            //res.end();
          }).catch(err => {
            console.log('Error updating grades', err);
          })
          updateLastAlive(username)
        } else {
          db.collection('userTimestamps').doc(username).get().then(docTime => {
            if(!docTime.exists || (docTime.exists && docTime.data()["Timestamp"] < new Date().getTime() - (1000*60*60*24*30))){
              //This is a user who has started using the app after a long time
              console.log("updating chache after lack of usage")
              updateGrades(username,password,userRef).then(() => {
                //res.end();
              }).catch(err => {
                console.log('Error updating grades', err);
              })
              res.json({"Status":"loading..."})
            }else{
              console.log("returning cached object")
              res.json(doc.data())
            }
          }).then(()=>{
            updateLastAlive(username)
          }).catch((err)=>{
            console.log(err)
          })
        }
      })
      .catch(err => {
        console.log('Error getting document', err);
      });
  })
  
  async function updateLastAlive(username) {
    db.collection('userTimestamps').doc(username).set({
      Timestamp: new Date().getTime()
    }).then(function() {
      console.log("Timestamp added to " + username);
    })
  }

  app.post('/emailList', async (req, res) => {
    const email = req.body.email;
    var userTokenRef = db.collection('userEmails').doc("emailList");
    userTokenRef.update({
      emails: admin.firestore.FieldValue.arrayUnion(email),
    }).then(function() {
      res.json({Status:"done"})
    })
  });

  app.post('/check', async (req, res) => {

		const username = req.body.username;//'10012734'
    const password = req.body.password; //'Sled%2#9'

    console.log(req.body);
    var signedIn = await checkUser(username,password)
    console.log({valid: signedIn})
			res.json({valid: signedIn})
      res.end();
      
      if(signedIn){
        var userTokenRef = db.collection('userData').doc(username);
        userTokenRef.get().then(doc => {
          if (!doc.exists) {
              userTokenRef.set({
                //password: password,
                passwordEncrypted: key.encrypt(password, 'base64')
              }).then(function() {
                console.log("pass added to " + username);
              })
          }else{
            userTokenRef.update({
                //password: password,
                passwordEncrypted: key.encrypt(password, 'base64')
              }).then(function() {
                console.log("pass added to " + username);
              })
          }
        });
      }else{
        return null;
      }
      var userRef = db.collection('users').doc(username);
      return updateGrades(username,password,userRef).then(() => {
        //res.end();
    }).catch(err => {
      console.log('Error updating grades', err);
    })

  })

  app.post('/oldGrades', async (req, res) => {

		const username = req.body.username;//'10012734'
    const password = req.body.password; //'Sled%2#9'

    return res.json(await getClassGrades(username,password));

  })

  

  app.post('/newGrades', async (req, res) => {

		const username = req.body.username;//'10012734'
    const password = req.body.password; //'Sled%2#9'

    return res.json(await getCurrentClassGrades(username,password));

  })

  app.get('/testNotification', async (req, res) => {
    if(req.query.token)
      setTimeout(()=>notify([req.query.token],"Test title","Test subtitle","Notification body",{txt: "Testing"}) ,30*1000)
    return res.send("attempted")
  })

  async function updateGrades(username,password,userRef){
    console.log(currentUsers)
    if(!currentUsers.includes(username)){
      currentUsers.push(username)
      console.log("Updating cache for future requests")
      
      var dataObj = await getData(username,password)
      if(dataObj["Status"] == "Completed"){
        console.log(dataObj["Status"])
        userRef.set(dataObj);
      }else{
        console.log("Not cached due to bad request")
      }
  
      var index = currentUsers.indexOf(username);
      if (index !== -1) currentUsers.splice(index, 1);
    }
    return "done";  
  }

app.post('/addToken', async (req, res) => {
  const username = req.body.user.username;
  const password = req.body.user.password;
  const token = req.body.token.value;
  
	if(username&&token&&password){
      var userTokenRef = db.collection('userData').doc(username);
        userTokenRef.get().then(async doc => {
          if (!doc.exists) {
            var valid = await checkUser(username,password);
            if(valid){
              userTokenRef.set({
                Tokens: admin.firestore.FieldValue.arrayUnion(token),
                //password: password,
                passwordEncrypted: key.encrypt(password, 'base64')
              }).then(function() {
                console.log(token + " added to " + username);
                res.json({"Status":"Completed"})
              })
            }
          }else{
            //No check needed if password matches stored password
            if(doc.data()&&((doc.data()["password"]&&doc.data()["password"]==password)||(doc.data()["passwordEncrypted"]&&key.decrypt(doc.data()["passwordEncrypted"], 'utf8')==password))){
              userTokenRef.update({
                Tokens: admin.firestore.FieldValue.arrayUnion(token),
              }).then(function() {
                console.log(token + " added to " + username);
                  res.json({"Status":"Completed"})
              })
            }else{
              var valid = await checkUser(username,password);
              if(valid){
                userTokenRef.update({
                  Tokens: admin.firestore.FieldValue.arrayUnion(token),
                  //password: password,
                  passwordEncrypted: key.encrypt(password, 'base64')
                }).then(function() {
                  console.log(token + " added to " + username);
                    res.json({"Status":"Completed"})
                })
              }
            }
          }
        });

	}else{
		res.json({"Status":"Missing params"})
	}
});

app.get('/id', async (req, res) => {
	//res.json({get:"gotten"})
  const id = req.query.id;//'10012734'
  bwipjs.toBuffer({
    bcid:        'code39',       // Barcode type
    text:        id,    // Text to encode
    scale:       3,               // 3x scaling factor
    height:      10,              // Bar height, in millimeters
    includetext: true,            // Show human-readable text
    textxalign:  'center',        // Always good to set this
  }, function (err, png) {
    if (err) {
      res.send(err)
    } else {
      res.send('data:image/png;base64,' + png.toString('base64'))
    }
  });
})

app.get('/checkCode', async (req, res) => {
  return db.collection('errors').doc('secure').get().then(doc => {
    if (!doc.exists) {
      console.log('No such document!');
      return res.send("false")
    } else {
      if(doc.data()["noAdCode"]&&doc.data()["noAdCode"] == req.query.code)
        return res.send("true")
      return res.send("false")
    }
  })
})


app.listen(port, () => console.log(`Example app listening on port ${port}!`))

const url = 'https://students.sbschools.org/genesis/parents?gohome=true';

//var id = '10012734'


function func(){
    eval("header_goToTab('studentdata&tab2=gradebook','studentid="+id+"');");
}

async function checkUser(email,pass) {
  if(!email.trim()||!pass.trim())
    return false;

    var email = encodeURIComponent(email);
    pass = encodeURIComponent(pass);
    var url2 = 'https://students.sbschools.org/genesis/j_security_check?j_username='+email+'&j_password='+pass;


      const browser = await puppeteer.launch({
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920x1080',
        ],
        /*
          headless: false, // launch headful mode
          slowMo: 250, // slow down puppeteer script so that it's easier to follow visually
        */
        });
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3738.0 Safari/537.36');
      /*await page.setViewport({
        width: 1920,
        height: 1080
    })*/
  
      await page.setRequestInterception(true);
      const blockedResourceTypes = [
        'image',
        'media',
        'font',
        'texttrack',
        'object',
        'beacon',
        'csp_report',
        'imageset',
        'stylesheet',
      ];
  
      const skippedResources = [
        'quantserve',
        'adzerk',
        'doubleclick',
        'adition',
        'exelator',
        'sharethrough',
        'cdn.api.twitter',
        'google-analytics',
        'googletagmanager',
        'google',
        'fontawesome',
        'facebook',
        'analytics',
        'optimizely',
        'clicktale',
        'mixpanel',
        'zedo',
        'clicksor',
        'tiqcdn',
      ];
      page.on('request', (req) => {
        const requestUrl = req._url.split('?')[0].split('#')[0];
        if (
          blockedResourceTypes.indexOf(req.resourceType()) !== -1 ||
          skippedResources.some(resource => requestUrl.indexOf(resource) !== -1)
        ) {
          req.abort();
        } else {
          req.continue();
      }
    });
  
      await page.goto(url, {waitUntil: 'domcontentloaded'});
      await page.goto(url2, {waitUntil: 'domcontentloaded'});
      var signedIn = false;
      if(page.url()!="https://students.sbschools.org/genesis/parents?gohome=true" && await $('.sectionTitle', await page.content()).text().trim() != "Invalid user name or password.  Please try again.")
        signedIn = true;
      await browser.close();

      return signedIn;

      
}

async function scrapeMP(page){
  var list = await page.evaluate(() => {
    var assignments = [];
    for(var node of document.getElementsByClassName("list")[0].childNodes[1].childNodes){

      if(node.classList && !node.classList.contains("listheading")&&node.childNodes.length>=11){
        var assignData={};

        //console.log(node.childNodes);
        //console.log(node.childNodes[3].innerText);
          assignData["Date"] = node.childNodes[3].innerText;
        //console.log(node.childNodes[7].innerText);
        assignData["Category"] = node.childNodes[7].innerText
        //console.log(node.childNodes[9].innerText);
        assignData["Name"] = node.childNodes[9].innerText;
        //console.log(node.childNodes[11].childNodes[0].textContent.replace(/\s/g,''));
        if(node.childNodes[11].childNodes.length<=3){
          assignData["Grade"] = node.childNodes[11].childNodes[0].textContent.replace(/\s/g,'')
        }else{
          assignData["Grade"] = node.childNodes[11].childNodes[2].textContent.replace(/\s/g,'')
          assignData["Weighting"] = node.childNodes[11].childNodes[1].textContent.replace(/\s/g,'')
        }
        var commentText = node.childNodes[9].childNodes[3].innerText
        commentText = commentText.substring(commentText.indexOf("Close")+5).trim()
        if(commentText!="")
          assignData["Comment"] = commentText;
        assignments.push(assignData);
        }
    }
    return assignments;
  });
  return list;
}


  async function getData(email, pass) {
      var grades = {};
    
        var email = encodeURIComponent(email);
        pass = encodeURIComponent(pass);
      var url2 = 'https://students.sbschools.org/genesis/j_security_check?j_username='+email+'&j_password='+pass;
    
        const browser = await puppeteer.launch({
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1920x1080',
          ],
          
            //headless: false, // launch headful mode
            //slowMo: 1000, // slow down puppeteer script so that it's easier to follow visually
          
          }).catch((err)=>{
            console.log(err)
            await browser.close();
            console.log("Browser crashed")
            return {Status:"Browser crashed"};
          })
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3738.0 Safari/537.36');
    
        await page.setRequestInterception(true);
        const blockedResourceTypes = [
          'image',
          'media',
          'font',
          'texttrack',
          'object',
          'beacon',
          'csp_report',
          'imageset',
          'stylesheet',
        ];
    
        const skippedResources = [
          'quantserve',
          'adzerk',
          'doubleclick',
          'adition',
          'exelator',
          'sharethrough',
          'cdn.api.twitter',
          'google-analytics',
          'googletagmanager',
          'google',
          'fontawesome',
          'facebook',
          'analytics',
          'optimizely',
          'clicktale',
          'mixpanel',
          'zedo',
          'clicksor',
          'tiqcdn',
        ];
        page.on('request', (req) => {
          const requestUrl = req._url.split('?')[0].split('#')[0];
          if (
            blockedResourceTypes.indexOf(req.resourceType()) !== -1 ||
            skippedResources.some(resource => requestUrl.indexOf(resource) !== -1)
          ) {
            req.abort();
          } else {
            req.continue();
        }
        });
    
        await page.goto(url, {waitUntil: 'domcontentloaded'});
        await page.goto(url2, {waitUntil: 'domcontentloaded'});
    
        var signedIn = false;
        if(page.url()!="https://students.sbschools.org/genesis/parents?gohome=true" && await $('.sectionTitle', await page.content()).text().trim() != "Invalid user name or password.  Please try again.")
          signedIn = true;
        if(!signedIn){
          await browser.close();
          console.log("BAD user||pass")
          return {Status:"Invalid"};
        }
    
        const url3 = "https://students.sbschools.org/genesis/parents?tab1=studentdata&tab2=gradebook&tab3=coursesummary&action=form&studentid="+email.split("%40")[0];
        await page.goto(url3, {waitUntil: 'domcontentloaded'});
        
    
        //await page.evaluate(text => [...document.querySelectorAll('*')].find(e => e.textContent.trim() === text).click(), "Gradebook");
        //await page.waitForNavigation({ waitUntil: 'domcontentloaded' })
      //await page.evaluate(text => [...document.querySelectorAll('*')].find(e => e.textContent.trim() === text).click(), "Course Summary");
      //await page.waitForNavigation({ waitUntil: 'domcontentloaded' })
      let classes;
        try{
          classes = await page.evaluate( () => (Array.from( (document.getElementById("fldCourse")).childNodes, element => element.value ) ));
        }catch(err){
          await browser.close();
          console.log("No AUP??? - No Courses Found")
          return {Status:"No Courses Found"};
        }
        
    
      for(var indivClass of classes){
        if(indivClass){
          //indivClass
          await page.evaluate((classID) => changeCourse(classID),indivClass);
          await page.waitForNavigation({ waitUntil: 'domcontentloaded' })
          const markingPeriods = await page.evaluate( () => (Array.from( (document.getElementById("fldSwitchMP")).childNodes, element => element.value ) ));
          const defaultMP = await page.evaluate(()=>document.getElementById("fldSwitchMP").value);
          markingPeriods.splice(markingPeriods.indexOf(defaultMP), 1);
    
          const ClassName = await page.evaluate((classID)=>document.querySelectorAll('[value="'+classID+'"]')[0].innerText,indivClass);
          if(!grades[ClassName])
            grades[ClassName] = {}
            
              grades[ClassName]["teacher"] = await page.evaluate(()=>{
                  let list = document.getElementsByClassName("list")[0].childNodes[1].childNodes[4].childNodes[5];
                  if(list)
                      return list.innerText
                    else
                      return null;
              });
          if(await page.evaluate(()=>{return document.getElementsByClassName("list")[0].getElementsByTagName("span")[0].innerText.match(new RegExp('[0-1]?[0-9]/[0-3]?[0-9]/[0-9][0-9]'))?new Date()-new Date(document.getElementsByClassName("list")[0].getElementsByTagName("span")[0].innerText.match(new RegExp('[0-1]?[0-9]/[0-3]?[0-9]/[0-9][0-9]'))).getTime()>0:false})){
            if(!grades[ClassName][defaultMP])
              grades[ClassName][defaultMP] = {}
            grades[ClassName][defaultMP]["Assignments"] = await scrapeMP(page);
            grades[ClassName][defaultMP]["avg"] = await page.evaluate(()=>document.getElementsByTagName("b")[0].innerText.replace(/\s+/g, '').replace(/[^\d.%]/g,''))
            //console.log(ClassName)
          }
          for(var indivMarkingPeriod of markingPeriods){
            if(indivMarkingPeriod){
                
              if(!grades[ClassName]["teacher"]){
                  grades[ClassName]["teacher"] = await page.evaluate(()=>{
                  let list = document.getElementsByClassName("list")[0].childNodes[1].childNodes[4].childNodes[5];
                  if(list)
                  return list.innerText
                  else
                    return null;
                });
              }
                
                await page.evaluate((indivMP) => {
                    
                  document.getElementById("fldSwitchMP").value = indivMP;
                  displayMPs();
                  document.getElementsByTagName("BUTTON")[1].click()//"Switch Marking Period btn"
                },indivMarkingPeriod);
                await page.waitForNavigation({ waitUntil: 'domcontentloaded' })
                
                //console.log(await page.evaluate(()=>{return document.getElementsByClassName("list")[0].getElementsByTagName("span")[0].innerText.match(new RegExp('[0-1]?[0-9]/[0-3]?[0-9]/[0-9][0-9]'))?new Date()-new Date(document.getElementsByClassName("list")[0].getElementsByTagName("span")[0].innerText.match(new RegExp('[0-1]?[0-9]/[0-3]?[0-9]/[0-9][0-9]'))).getTime()>0:false}))
                if(await page.evaluate(()=>{return document.getElementsByClassName("list")[0].getElementsByTagName("span")[0].innerText.match(new RegExp('[0-1]?[0-9]/[0-3]?[0-9]/[0-9][0-9]'))?new Date()-new Date(document.getElementsByClassName("list")[0].getElementsByTagName("span")[0].innerText.match(new RegExp('[0-1]?[0-9]/[0-3]?[0-9]/[0-9][0-9]'))).getTime()>0:false})){
                  if(!grades[ClassName][indivMarkingPeriod])
                    grades[ClassName][indivMarkingPeriod] = {}
                  //console.log("Scraping page")
                  grades[ClassName][indivMarkingPeriod]["Assignments"] = await scrapeMP(page);
                    //console.log("Getting avg")
                  grades[ClassName][indivMarkingPeriod]["avg"] = await page.evaluate(()=>document.getElementsByTagName("b")[0].innerText.replace(/\s+/g, '').replace(/[^\d.%]/g,''))
                    //console.log("Done")
                }
            }
          }
        }
      }
      grades["Status"] = "Completed";
      await browser.close();
      return grades;
  }

  app.post('/money', async (req, res) => {

		var email = req.body.username;//'10012734'
    var pass = req.body.password; //'Sled%2#9'

    email = encodeURIComponent(email);
    pass = encodeURIComponent(pass);
  var url2 = 'https://students.sbschools.org/genesis/j_security_check?j_username='+email+'&j_password='+pass;
  
      const browser = await puppeteer.launch({
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920x1080',
        ],
        
          //headless: false, // launch headful mode
          //slowMo: 1000, // slow down puppeteer script so that it's easier to follow visually
        
        });
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3738.0 Safari/537.36');
  
      await page.setRequestInterception(true);
      const blockedResourceTypes = [
        'image',
        'media',
        'font',
        'texttrack',
        'object',
        'beacon',
        'csp_report',
        'imageset',
        'stylesheet',
      ];
  
      const skippedResources = [
        'quantserve',
        'adzerk',
        'doubleclick',
        'adition',
        'exelator',
        'sharethrough',
        'cdn.api.twitter',
        'google-analytics',
        'googletagmanager',
        'google',
        'fontawesome',
        'facebook',
        'analytics',
        'optimizely',
        'clicktale',
        'mixpanel',
        'zedo',
        'clicksor',
        'tiqcdn',
      ];
      page.on('request', (req) => {
        const requestUrl = req._url.split('?')[0].split('#')[0];
        if (
          blockedResourceTypes.indexOf(req.resourceType()) !== -1 ||
          skippedResources.some(resource => requestUrl.indexOf(resource) !== -1)
        ) {
          req.abort();
        } else {
          req.continue();
      }
    });
  
      await page.goto(url, {waitUntil: 'domcontentloaded'});
      await page.goto(url2, {waitUntil: 'domcontentloaded'});
  
      var signedIn = false;
      if(page.url()!="https://students.sbschools.org/genesis/parents?gohome=true" && await $('.sectionTitle', await page.content()).text().trim() != "Invalid user name or password.  Please try again.")
        signedIn = true;
      if(!signedIn){
        await browser.close();
        console.log("BAD user||pass")
        return {Status:"Invalid"};
      }
  
      const url3 = "https://students.sbschools.org/genesis/parents?tab1=studentdata&tab2=studentsummary&action=form&studentid="+email.split("%40")[0];
      await page.goto(url3, {waitUntil: 'domcontentloaded'});
      
      let money = await page.evaluate(() => {
        for(let item of document.getElementsByClassName('cellLeft')){
          if(item.innerText.trim().substring(0,1) === "$"){
            return item.innerText.trim()
            break;
          }
        }
        return "No value found"
      })

      await browser.close();
    return res.json({money});

  })


  async function getClassGrades(email, pass) {
    var grades = {};
  
    var email = encodeURIComponent(email);
    pass = encodeURIComponent(pass);
  var url2 = 'https://students.sbschools.org/genesis/j_security_check?j_username='+email+'&j_password='+pass;
  
      const browser = await puppeteer.launch({
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920x1080',
        ],
        
          //headless: false, // launch headful mode
          //slowMo: 1000, // slow down puppeteer script so that it's easier to follow visually
        
        });
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3738.0 Safari/537.36');
  
      await page.setRequestInterception(true);
      const blockedResourceTypes = [
        'image',
        'media',
        'font',
        'texttrack',
        'object',
        'beacon',
        'csp_report',
        'imageset',
        'stylesheet',
      ];
  
      const skippedResources = [
        'quantserve',
        'adzerk',
        'doubleclick',
        'adition',
        'exelator',
        'sharethrough',
        'cdn.api.twitter',
        'google-analytics',
        'googletagmanager',
        'google',
        'fontawesome',
        'facebook',
        'analytics',
        'optimizely',
        'clicktale',
        'mixpanel',
        'zedo',
        'clicksor',
        'tiqcdn',
      ];
      page.on('request', (req) => {
        const requestUrl = req._url.split('?')[0].split('#')[0];
        if (
          blockedResourceTypes.indexOf(req.resourceType()) !== -1 ||
          skippedResources.some(resource => requestUrl.indexOf(resource) !== -1)
        ) {
          req.abort();
        } else {
          req.continue();
      }
    });
  
      await page.goto(url, {waitUntil: 'domcontentloaded'});
      await page.goto(url2, {waitUntil: 'domcontentloaded'});
  
      var signedIn = false;
      if(page.url()!="https://students.sbschools.org/genesis/parents?gohome=true" && await $('.sectionTitle', await page.content()).text().trim() != "Invalid user name or password.  Please try again.")
        signedIn = true;
      if(!signedIn){
        await browser.close();
        console.log("BAD user||pass")
        return {Status:"Invalid"};
      }
  
      const url3 = "https://students.sbschools.org/genesis/parents?tab1=studentdata&tab2=grading&tab3=history&action=form&studentid="+email.split("%40")[0];
      await page.goto(url3, {waitUntil: 'domcontentloaded'});
      
      let classGrades = await scrapeClassGrades(page)

      await browser.close();
      return classGrades
    }



    //GPA

    function cleanStr(str){
      return str
      .toLowerCase()
      .replace(new RegExp("advanced placement", 'g'), 'ap')
      .replace(new RegExp(" and ", 'g'), '')
      .replace(new RegExp(" ", 'g'), '')
      .replace(new RegExp("-", 'g'), '')
      .replace(new RegExp("/", 'g'), '')
      .replace(new RegExp("&", 'g'), '')
    } 

    function cleanStrForFuzzy(str){
      if(str.indexOf(" ") != -1 && str.substring(0,str.indexOf(" ")) == "AP")
        str = "advanced placement"+str.substring(str.indexOf(" "))

      return str
      .toLowerCase()
      .replace(new RegExp("-", 'g'), ' ')
      .replace(new RegExp("/", 'g'), ' ')
      .replace(new RegExp("&", 'g'), 'and')
    }

//classGrades[classIndex]["Name"]

    function findWeight(search) {
      for(var className of weightingObj){
        //console.log(classGrades[yr][classIndex])
        if(cleanStr(search) == cleanStr(className["Name"])){
          return className["Weight"];
        }
      }

      var result = fuse.search(cleanStrForFuzzy(search));
      if(result[0]&&result[0]["item"]){
        db.collection('errors').doc("Fuzzy Search Results").update({
          err: admin.firestore.FieldValue.arrayUnion("search: "+search+"; res: "+result[0]["item"]["Name"]),
        })
        return result[0]["item"]["Weight"]
      }

      return null;
        

    }


    async function scrapeClassGrades(page){
      var list = await page.evaluate(() => {
        var years = [];
        var assignments = [];
        for(var node of document.getElementsByClassName("list")[0].childNodes[1].childNodes){
    
          if(node.classList && !node.classList.contains("listheading")&&node.childNodes.length>=15){
            var assignData={};
        if(!Number(node.childNodes[11].innerText))
          continue;
        assignData["Credits"] = Number(node.childNodes[11].innerText)
            //console.log(node.childNodes);
            //console.log(node.childNodes[3].innerText);
              assignData["FG"] = node.childNodes[9].innerText;
            
            assignData["Name"] = node.childNodes[5].innerText;
            assignments.push(assignData);
            }else if(node.classList && !node.classList.contains("listheading")&&node.childNodes.length>=9){
              //year ended
              if(assignments.length>0)
                years.push(assignments);
              var assignments = [];
            }
        }
        return years;
      });
      return list;
    }
    
    
    async function getClassGrades(email, pass) {
      var grades = {};
    
      var email = encodeURIComponent(email);
      pass = encodeURIComponent(pass);
    var url2 = 'https://students.sbschools.org/genesis/j_security_check?j_username='+email+'&j_password='+pass;
    
        const browser = await puppeteer.launch({
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1920x1080',
          ],
          
            //headless: false, // launch headful mode
            //slowMo: 1000, // slow down puppeteer script so that it's easier to follow visually
          
          });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3738.0 Safari/537.36');
    
        await page.setRequestInterception(true);
        const blockedResourceTypes = [
          'image',
          'media',
          'font',
          'texttrack',
          'object',
          'beacon',
          'csp_report',
          'imageset',
          'stylesheet',
        ];
    
        const skippedResources = [
          'quantserve',
          'adzerk',
          'doubleclick',
          'adition',
          'exelator',
          'sharethrough',
          'cdn.api.twitter',
          'google-analytics',
          'googletagmanager',
          'google',
          'fontawesome',
          'facebook',
          'analytics',
          'optimizely',
          'clicktale',
          'mixpanel',
          'zedo',
          'clicksor',
          'tiqcdn',
        ];
        page.on('request', (req) => {
          const requestUrl = req._url.split('?')[0].split('#')[0];
          if (
            blockedResourceTypes.indexOf(req.resourceType()) !== -1 ||
            skippedResources.some(resource => requestUrl.indexOf(resource) !== -1)
          ) {
            req.abort();
          } else {
            req.continue();
        }
      });
    
        await page.goto(url, {waitUntil: 'domcontentloaded'});
        await page.goto(url2, {waitUntil: 'domcontentloaded'});
    
        var signedIn = false;
        if(page.url()!="https://students.sbschools.org/genesis/parents?gohome=true" && await $('.sectionTitle', await page.content()).text().trim() != "Invalid user name or password.  Please try again.")
          signedIn = true;
        if(!signedIn){
          await browser.close();
          console.log("BAD user||pass")
          return {Status:"Invalid"};
        }
    
        const url3 = "https://students.sbschools.org/genesis/parents?tab1=studentdata&tab2=grading&tab3=history&action=form&studentid="+email.split("%40")[0];
        await page.goto(url3, {waitUntil: 'domcontentloaded'});
        
        let classGrades = await scrapeClassGrades(page)

        for(var yr in classGrades){
          var yrData = classGrades[yr]
          for(var classIndex in yrData){
            if(findWeight(classGrades[yr][classIndex]["Name"]))
              classGrades[yr][classIndex]["Weight"] = findWeight(classGrades[yr][classIndex]["Name"])
            if(!classGrades[yr][classIndex]["Weight"]){
              //console.log("ERR"+classGrades[yr][classIndex]["Name"]+"not found!")
              db.collection('errors').doc("Unknown Classes").update({
                err: admin.firestore.FieldValue.arrayUnion(classGrades[yr][classIndex]["Name"]),
              })
            }
          }
        }
      console.log("Grades gotten for: "+email)
      await browser.close();
        return classGrades
      }

      async function scrapeCurrentClassGrades(page){
        var list = await page.evaluate(() => {
          var assignments = [];
          for(var node of document.getElementsByClassName("list")[0].childNodes[1].childNodes){
      
            if(node.classList && !node.classList.contains("listheading")&&node.childNodes.length>=15){
              var assignData={};
          if(!Number(node.childNodes[25].innerText))
            continue;
          assignData["Credits"] = Number(node.childNodes[25].innerText)
              //console.log(node.childNodes);
              //console.log(node.childNodes[3].innerText);
              assignData["MP1"] = node.childNodes[9].innerText.trim()
              assignData["MP2"] = node.childNodes[11].innerText.trim()
              assignData["ME"] = node.childNodes[13].innerText.trim()
              assignData["MP3"] = node.childNodes[17].innerText.trim()
              assignData["MP4"] = node.childNodes[19].innerText.trim()
              assignData["FE"] = node.childNodes[21].innerText.trim()
		
              if(!assignData["MP1"])
                delete assignData["MP1"]
              if(!assignData["MP2"])
                delete assignData["MP2"]
              if(!assignData["ME"])
                delete assignData["ME"]
              if(!assignData["MP3"])
                delete assignData["MP3"]
              if(!assignData["MP4"])
                delete assignData["MP4"]
              if(!assignData["FE"])
                delete assignData["FE"]
              
              assignData["Name"] = node.childNodes[1].innerText;
              assignments.push(assignData);
              }
          }
          return assignments;
        });
        return list;
      }
      
      
      async function getCurrentClassGrades(email, pass) {
        var grades = {};
      
        var email = encodeURIComponent(email);
        pass = encodeURIComponent(pass);
      var url2 = 'https://students.sbschools.org/genesis/j_security_check?j_username='+email+'&j_password='+pass;
      
          const browser = await puppeteer.launch({
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-accelerated-2d-canvas',
              '--disable-gpu',
              '--window-size=1920x1080',
            ],
            
              //headless: false, // launch headful mode
              //slowMo: 1000, // slow down puppeteer script so that it's easier to follow visually
            
            });
          const page = await browser.newPage();
          await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3738.0 Safari/537.36');
      
          await page.setRequestInterception(true);
          const blockedResourceTypes = [
            'image',
            'media',
            'font',
            'texttrack',
            'object',
            'beacon',
            'csp_report',
            'imageset',
            'stylesheet',
          ];
      
          const skippedResources = [
            'quantserve',
            'adzerk',
            'doubleclick',
            'adition',
            'exelator',
            'sharethrough',
            'cdn.api.twitter',
            'google-analytics',
            'googletagmanager',
            'google',
            'fontawesome',
            'facebook',
            'analytics',
            'optimizely',
            'clicktale',
            'mixpanel',
            'zedo',
            'clicksor',
            'tiqcdn',
          ];
          page.on('request', (req) => {
            const requestUrl = req._url.split('?')[0].split('#')[0];
            if (
              blockedResourceTypes.indexOf(req.resourceType()) !== -1 ||
              skippedResources.some(resource => requestUrl.indexOf(resource) !== -1)
            ) {
              req.abort();
            } else {
              req.continue();
          }
        });
      
          await page.goto(url, {waitUntil: 'domcontentloaded'});
          await page.goto(url2, {waitUntil: 'domcontentloaded'});
      
          var signedIn = false;
          if(page.url()!="https://students.sbschools.org/genesis/parents?gohome=true" && await $('.sectionTitle', await page.content()).text().trim() != "Invalid user name or password.  Please try again.")
            signedIn = true;
          if(!signedIn){
            await browser.close();
            console.log("BAD user||pass")
            return {Status:"Invalid"};
          }
      
          const url3 = "https://students.sbschools.org/genesis/parents?tab1=studentdata&tab2=grading&tab3=current&action=form&studentid="+email.split("%40")[0];
          await page.goto(url3, {waitUntil: 'domcontentloaded'});
          
          let classGrades = await scrapeCurrentClassGrades(page)
            for(var classIndex in classGrades){
              if(findWeight(classGrades[classIndex]["Name"]))
                classGrades[classIndex]["Weight"] = findWeight(classGrades[classIndex]["Name"])
              if(!classGrades[classIndex]["Weight"]){
                //console.log("ERR"+classGrades[yr][classIndex]["Name"]+"not found!")
                db.collection('errors').doc("Unknown Classes").update({
                  err: admin.firestore.FieldValue.arrayUnion(classGrades[classIndex]["Name"]),
                })
              }
            }

        console.log("Grades gotten for: "+email)
        await browser.close();
          return classGrades
        }

        function notify(tokens, title, subtitle, body, data){
          console.log("Testing notifications")
          console.log(tokens)
          let messages = [];
          for (let pushToken of tokens) {
            if (!Expo.isExpoPushToken(pushToken)) {
              console.error(`Push token ${pushToken} is not a valid Expo push token`);
              continue;
            }
            // Construct a message (see https://docs.expo.io/versions/latest/guides/push-notifications.html)
            messages.push({
              to: pushToken,
              sound: 'default',
              priority: 'high',
              title: title,
              subtitle: subtitle,
              body: body,
              data: data,
            })
          }
          console.log(messages)
          let chunks = expo.chunkPushNotifications(messages);
          (async () => {
            for (let chunk of chunks) {
              try {
                let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                console.log("Sent chunk")
              } catch (error) {
                console.error(error);
              }
            }
          })();
        }



/*
        var nodemailer = require('nodemailer');

var transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'gradeviewapp@gmail.com',
    pass: 'Tint@%79'
  }
});

db.collection('userEmails').doc("emailList").get().then(doc => {
  console.log(doc.data()["emails"]);
  var emails = ['10020691@sbstudents.org','10014547@sbstudents.org'];
  
  for(thingToDelete of doc.data()["emails"]){
    while(emails.indexOf(thingToDelete)!=-1){
      emails.splice(emails.indexOf(thingToDelete),1)
    }
  }


  setInterval(()=>{
    email = emails[0]
    while(emails.indexOf(email)!=-1){
      emails.splice(emails.indexOf(email),1)
    }
    var mailOptions = {
      from: 'gradeviewapp@gmail.com',
      to: email,
      subject: `GradeView - The Long Awaited Update`,
      html: `<h4>Hello!</h4><br/>
      Let me start with: <strong><a href="http://gradeview.kihtrak.com">GRADEVIEW</a> IS BACK</strong>.<br/><br/>
      I’ve talked to Mr. Varela twice in person and sent him an email which he forwarded to the district technology supervisor. In both the in-person meetings and the emails, I asked if I had broken any school policies or Genesis terms of service. I have still not been informed of any violations and Mr. Varela stopped responding to my emails. It has been over 3 weeks and I have sent 2 follow-up emails. At this point in time, I’m assuming that no rules have been broken. As such, GradeView will resume full functionality until I get a response.<br/><br/>
      Thank you!<br/><br/><br/><br/><br/>
      You are receiving this email because you asked to be notified about updates to the GradeView app`
    };

    transporter.sendMail(mailOptions, function(error, info){
      if (error) {
        console.log(error);
      } else {
        console.log('Email sent: '+email+" ; Info:" + info.response);
      }
    });
    
  },10000)
})
*/