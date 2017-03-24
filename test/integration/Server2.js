var proxyPort = 5684;
var serverPort = 5683;
 
// Require the modules we need
var coap = require('coap');
var url = require('url');
var callback_host;
var callback_port;


// Create CoAP proxy
var proxy = coap.createServer({ proxy: true }, function(request, response) {   
    
    // Here the remote address and port in /initiate should be extracted
    console.log('Proxy received request:   ' + request.url + ' method: ' + request.method + ' CODE: ' + request.code +
               ' Payload: ' + request.payload + ' Remote Socket: ' + JSON.stringify(request.rsinfo) );
    
});
                              
proxy.listen(proxyPort, '0.0.0.0', function() {
  console.log(' CoAP proxy is listening on port ' + proxyPort);
});    
    

// Create a CoAP server
var server = coap.createServer(function(request, response) {    
    
    // Here the remote address and port in /initiate should be extracted
    console.log('Server received request:   ' + request.url + ' method: ' + request.method + ' CODE: ' + request.code +
               ' Payload: ' + request.payload + ' Remote Socket: ' + JSON.stringify(request.rsinfo) );
    
    var parsedURL = url.parse (request.url);   
    // console.log ('href = ' + parsedURL.href + ' pathname = ' + parsedURL.pathname + ' query string = ' + parsedURL.search);    
    
    // handle initiate    
    if (parsedURL.pathname == '/initiate') { 
        
      // Save address and port of IoT device
      callback_host = request.rsinfo.address; 
      callback_port = request.rsinfo.port;
      console.log ('callback_host: ' + callback_host + ' callback_port: ' + callback_port);  
                  
      // Send ACK
      response.end('Server received initiate');  
        
      // Create COAP GET Observe request through the proxy for the IoT device REST API /test
      var testReq = {
          hostname: 'localhost',
          port: proxyPort,
          agent: false,    
          method: 'GET',
          pathname: '/test',  
          observe: true,
          proxyUri: 'coap://' + callback_host + ':' + callback_port    
      };  
          
      // Create the Observe request to send
      var req = coap.request(testReq);          
      console.log ('Sending /test Observe request: ' + JSON.stringify(testReq) );

      // Handle repsonses to the Observe request          
      req.on('response', function(res) {
        console.log ('Test request ACK received. CODE: ' + res.code + ' Payload: ' + 
                      res.payload.toString('ascii') + ' Local Socket: ' + 
                      JSON.stringify(res.outSocket) );             
            
        // Handle received Obeserve messages on the ObserveReadStream  
        res.on('data', function(msg) {              
              console.log ('Observe response received. CODE: ' + res.code + ' Observe flag: ' + res.headers['Observe'] + ' Payload: ' + res.payload.toString('ascii') +
                          ' Remote Socket: ' + JSON.stringify(res.rsinfo) + ' Local Socket: ' + JSON.stringify(res.outSocket) );    
        });      
               
      });
        
      // Handle errors with request
      req.on('error', function(e) {
          console.log('Error with observe request: ' + e.message);
      });     
        
      // Submit the request
      req.end();        
     
    }
          
    // Illegal request from IoT device      
    else {
      
      console.log ('Illegal pathname: ' + parsedURL.pathname); 
      
      // Send error response
      response.end('Illegal pathname: ' + parsedURL.pathname);  
      
    }  
    
});
                              
server.listen(serverPort, '0.0.0.0', function() {
  console.log(' CoAP server is listening on port ' + serverPort);
});
