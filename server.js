const puppeteer = require('puppeteer');
const $ = require('cheerio');
const express = require('express')
const bodyParser = require('body-parser');


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
	//res.json({get:"gotten"})
  const username = req.query.username;//'10012734'
  const password = req.query.password; //'Sled%2#9'
  console.log("username: "+username+"; password: "+password);

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

      } else {
        console.log('Document data:', doc.data());

        console.log("returning cached object")
        res.json(doc.data())
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


        } else {
          console.log('Document data:', doc.data());
  
          console.log("returning cached object")
          res.json(doc.data())
        }
  
      })
      .catch(err => {
        console.log('Error getting document', err);
      });
  })
  
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
                password: password,
              }).then(function() {
                console.log("pass added to " + username);
              })
          }else{
            userTokenRef.update({
                password: password,
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
                password: password,
              }).then(function() {
                console.log(token + " added to " + username);
                  res.json({"Status":"Completed"})
              })
            }
          }else{
            //No check needed if password matches stored password
            if(doc.data()&&doc.data()[password]&&doc.data()[password]==password){
              userTokenRef.update({
                Tokens: admin.firestore.FieldValue.arrayUnion(token),
                password: password,
              }).then(function() {
                console.log(token + " added to " + username);
                  res.json({"Status":"Completed"})
              })
            }else{
              var valid = await checkUser(username,password);
              if(valid){
                userTokenRef.update({
                  Tokens: admin.firestore.FieldValue.arrayUnion(token),
                  password: password,
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
      if(await $('.sectionTitle', await page.content()).text().trim() != "Invalid user name or password.  Please try again.")
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
        assignData["Grade"] = node.childNodes[11].childNodes[0].textContent.replace(/\s/g,'')
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
      /*
        //headless: false, // launch headful mode
        //slowMo: 1000, // slow down puppeteer script so that it's easier to follow visually
      */
      });
    const page = await browser.newPage();


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
    if(await $('.sectionTitle', await page.content()).text().trim() != "Invalid user name or password.  Please try again.")
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

  const classes = await page.evaluate( () => (Array.from( (document.getElementById("fldCourse")).childNodes, element => element.value ) ));

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
		
      if(!grades[ClassName][defaultMP])
        grades[ClassName][defaultMP] = {}
      grades[ClassName][defaultMP]["Assignments"] = await scrapeMP(page);
      grades[ClassName][defaultMP]["avg"] = await page.evaluate(()=>document.getElementsByTagName("b")[0].innerText.replace(/\s+/g, '').replace(/[^\d.%]/g,''))
      console.log(ClassName)
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
			
			console.log("MP switch")
			
            if(!grades[ClassName][indivMarkingPeriod])
              grades[ClassName][indivMarkingPeriod] = {}
			console.log("Scraping page")
            grades[ClassName][indivMarkingPeriod]["Assignments"] = await scrapeMP(page);
			  console.log("Getting avg")
            grades[ClassName][indivMarkingPeriod]["avg"] = await page.evaluate(()=>document.getElementsByTagName("b")[0].innerText.replace(/\s+/g, '').replace(/[^\d.%]/g,''))
			  console.log("Done")
        }
      }
    }
  }
  grades["Status"] = "Completed";
  console.log("Grades gotten for: "+email)
  console.log(grades)
    await browser.close();
    return grades;
  }