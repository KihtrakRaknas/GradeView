const puppeteer = require('puppeteer');
const $ = require('cheerio');
const express = require('express')
const bodyParser = require('body-parser');


//console.log(getData('10012734@sbstudents.org','Sled%2#9'));


storage.init( /* options ... */ );

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
    
    var userRef = db.collection('users').doc(username);

    console.log(req.body);
    var signedIn = await checkUser(username,password)
    console.log({valid: signedIn})
			res.json({valid: signedIn})
      res.end();
      
      if(signedIn){
        var userTokenRef = db.collection('userData').doc(username);
        userTokenRef.get().then(doc => {
          if (!doc.exists) {
            if(await checkUser(username,password)){
              userTokenRef.set({
                password: password,
              }).then(function() {
                console.log("pass added to " + username);
              })
            }
          }else{
            userTokenRef.update({
                password: password,
              }).then(function() {
                console.log("pass added to " + username);
              })
          }
        });
      }
    
      return updateGrades(username,password,userRef).then(() => {
        //res.end();
    }).catch(err => {
      console.log('Error updating grades', err);
    })

  })

  async function updateGrades(username,password,userRef){
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
        userTokenRef.get().then(doc => {
        if (!doc.exists) {
          if(await checkUser(username,password)){
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
            if(await checkUser(username,password)){
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
    var email = encodeURIComponent(email);
    pass = encodeURIComponent(pass);
    var url2 = 'https://students.sbschools.org/genesis/j_security_check?j_username='+email+'&j_password='+pass;


      const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
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
  
      page.on('request', (req) => {
          if(req.resourceType() == 'stylesheet' || req.resourceType() == 'font' || req.resourceType() === 'image' || req.resourceType() === 'media'){
              req.abort();
          }
          else {
              req.continue();
          }
    });
  
      await page.goto(url, {waitUntil: 'networkidle2'});
      await page.goto(url2, {waitUntil: 'networkidle2'});

      var signedIn = false;
      if(await $('.sectionTitle', await page.content()).text().trim() != "Invalid user name or password.  Please try again.")
        signedIn = true;
      await browser.close();

      return signedIn;

      
}

async function getData(email, pass) {
	var email = encodeURIComponent(email);
	pass = encodeURIComponent(pass);
var url2 = 'https://students.sbschools.org/genesis/j_security_check?j_username='+email+'&j_password='+pass;

    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
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

    page.on('request', (req) => {
        if(req.resourceType() == 'stylesheet' || req.resourceType() == 'font' || req.resourceType() === 'image' || req.resourceType() === 'media'){
            req.abort();
        }
        else {
            req.continue();
        }
	});

    await page.goto(url, {waitUntil: 'networkidle2'});
    await page.goto(url2, {waitUntil: 'networkidle2'});

    var signedIn = false;
    if(await $('.sectionTitle', await page.content()).text().trim() != "Invalid user name or password.  Please try again.")
      signedIn = true;
    if(!signedIn){
      await browser.close();
      console.log("BAD user||pass")
      return {Status:"Invalid"};
    }

	console.log(signedIn);

    await page.evaluate(text => [...document.querySelectorAll('*')].find(e => e.textContent.trim() === text).click(), "Gradebook");
	await page.waitForNavigation({ waitUntil: 'networkidle2' })

    const markingPeriods = await page.evaluate( () => (Array.from( (document.querySelectorAll( '[name="fldMarkingPeriod"]')[0]).childNodes, element => element.value ) ));

    console.log( "marking period:" + markingPeriods );
    //var htmlOld = await page.content();
    var grades = {}
    var isCurrentMarking = false;
    for(var period of markingPeriods){
      if(period!=null){
        console.log("period: " + period);
        navresponse = page.waitForNavigation(['networkidle0', 'load', 'domcontentloaded']);
        await page.evaluate(text => [...document.querySelectorAll('*')].find(e => e.textContent.trim() === text).click(), "Gradebook");
        await navresponse
        var htmlOld = await page.content();
        //htmlTemp = await page.content()
        console.log("navigated to gradebook")

        navresponse = page.waitForNavigation(['networkidle0', 'load', 'domcontentloaded']);
        const currentMarking = await page.evaluate( () => ((document.querySelectorAll( '[name="fldMarkingPeriod"]')[0]).value));
		var htmlTemp;
        if(currentMarking!=period){
			console.log("switchSTART")
          await page.evaluate((markingPeriod) => switchMarkingPeriod(markingPeriod),period);
          console.log("switch")
          await navresponse
          	var htmlTemp = await page.content();
        	console.log("HTML1");
          isCurrentMarking = false;
        }else{
			htmlTemp = htmlOld;
      console.log("tempDone");
      isCurrentMarking = true;
		}

    const html = htmlTemp;
		//console.log(html);

        //await page.screenshot({path: period+'examples.png'});
        var title
        await $('.list', html).find("tbody").find(".categorytab").each(function() {
          const className = $(this).text().trim();
            console.log("ClassName: "+className);
            if(!grades[className])
              grades[className] = {}
            var teacherName = $(this).parent().parent().find(".cellLeft").eq(1).text().trim();
            teacherName=teacherName.substring(0,teacherName.indexOf("\n"));
            console.log("Teacher Name: "+teacherName);
            if(!grades[className]["teacher"])
              grades[className]["teacher"]=teacherName;


              //var avg = $(this).parent().parent().find($("td[title='View Course Summary']")).textContent;
              var avg = $(this).parent().parent().find(".cellRight").eq(0).text().trim();
              avg=avg.substring(0,avg.indexOf("\n"));
              console.log("Average"+avg);
            if(!grades[className][period])
              grades[className][period]={}
            grades[className][period]["avg"]=avg;
            grades[className]["title"]= $(this).prop('title');


        });
        console.log("done");
        if(!isCurrentMarking)
          var html2 = await page.content();
        for(var classs in grades){
          console.log("Getting grades for: "+grades[classs]["title"]);

          navresponse = page.waitForNavigation(['networkidle0', 'load', 'domcontentloaded']);

          try{
              await page.evaluate((text) => document.querySelector("span[title='"+text+"']").click(),grades[classs]["title"]);
                    //var res = page.click("span[title='"+grades[classs]["title"]+"']");
          }catch(e){
            console.log("Err: "+e)
          }

          console.log("res")
          //await res;
          await navresponse;
          console.log("response")

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
          grades[classs][period]["Assignments"] = list;
          //console.log(grades[classs][period]["Assignments"]);


          //await page.screenshot({path: classs+'examples.png'});
          console.log("Going to grade book");
          navresponse = page.waitForNavigation(['networkidle0', 'load', 'domcontentloaded']);
          await page.evaluate(text => [...document.querySelectorAll('*')].find(e => e.textContent.trim() === text).click(), "Gradebook");
          await navresponse;
          //await page.waitForNavigation(['networkidle0', 'load', 'domcontentloaded']);//page.waitForNavigation({ waitUntil: 'networkidle2' })
          if(!isCurrentMarking){
            console.log("Slecting marking");

            navresponse = page.waitForNavigation(['networkidle0', 'load', 'domcontentloaded']);

            await page.evaluate((markingPeriod) => switchMarkingPeriod(markingPeriod),period);
            //await page.waitForNavigation({ waitUntil: 'networkidle2' })
            await navresponse;
            //console.log(navresponse)
            //await page.screenshot({path: 'examples.png'});
          }

        }
        htmlOld = html2;

      }
    }

    grades["Status"] = "Completed";
	console.log("Function done")
    //console.log(grades);



    await browser.close();

    return grades;

  }


/*puppeteer
  .launch()
  .then(function(browser){
    return browser.newPage();
  })
  .then(function(page) {
    return page.goto().then(function() {
        return page.goto(url2).then(function() {
            //page.find(".headerCategoryTabSelected").click();
            page.evaluate(text => [...document.querySelectorAll('*')].find(e => e.textContent.trim() === text).click(), "Gradebook")
            //console.log(page.content())
            page.waitForNavigation({ waitUntil: 'networkidle0' })

            return page.content();
        });
    });
  })
  .then(function(html) {
    //console.log(html);
    page.screenshot({path: 'examples.png'});

  })
  .catch(function(err) {
    //handle error
  });*/
