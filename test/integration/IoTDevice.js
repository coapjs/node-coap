// Require the modules we need
var coap = require('coap');
var url = require('url');

// Send initiate
function sendInitiate () {
 
    // Create COAP POST request for server REST API /initiate
    var initReq = {
      hostname: 'localhost',
      port: 5683,  
      //agent: false,
      method: 'POST',
      pathname: '/initiate'    
    };  
    
    // Create the request to send
    var req = coap.request(initReq);

    console.log ('Sending init request = ' + JSON.stringify(initReq) );
    
    // Handle response
    req.on('response', function(res) {
      console.log ('CoAP ACK received. CODE: ' + res.code + ' Payload: ' + res.payload.toString('ascii') + ' Local Socket: ' + JSON.stringify(res.outSocket) );
      listenForAPICalls (res.outSocket.port);      
    });
    
    // Handle errors with request
    req.on('error', function(e) {
       console.log('Error with initiate request: ' + e.message);
    });    

    // Submit the request
    req.end(); 
}    

// Listen for REST API calls
function listenForAPICalls (port) {
    
    // Create a coap server with a callback handling all requests
    var coapServer = coap.createServer(function(request, response) {
      console.log(' Received request:   ' + request.url + ' method: ' + request.method + ' CODE: ' + request.code + ' Observe flag (0 states Observe) ' +
               request.headers['Observe'] + ' Payload: ' + request.payload + ' Remote Socket: ' + JSON.stringify(request.rsinfo) );

      var parsedURL = url.parse (request.url);   
      // console.log ('href = ' + parsedURL.href + ' pathname = ' + parsedURL.pathname + ' query string = ' + parsedURL.search);  
        
      
      // Handle call to test API      
      if (parsedURL.pathname == '/test') {
          
          // Normal GET request. Respond immediately that no fall has been detected
          if (request.headers['Observe'] !== 0) {
              response.end('test vakue');
          }
          
          // Observe
          else {
              // console.log ('Falldetect Observe GET request received');
             
              // First ACK that request has been received              
              response.write('1st observe response, Ack on /test');
              console.log ('1st observe response sent, Ack on /test');
              
              // Then after 3 seconds send message that fall has been detected
              setTimeout(function() {
                  response.write('2nd observe response'); 
                  console.log ('2nd observe response sent');
              }, 3000); 
              
          }     
      } 
      
      // Illegal request  
      else {
         console.log ('Illegal request. Pathname= ' +  parsedURL.pathname);
         response.end('Illegal request. Pathname= ' +  parsedURL.pathname); 
              
      }      
      


    });    
    
    // Setup the CoAP-server to listen to a port
    coapServer.listen(port, function() {
        console.log(' CoAP server is listening on port ' + port);
    });
    
}    
    
sendInitiate ();

