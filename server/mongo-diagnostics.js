// Inspect driver causes locally, but return only fixed, credential-free diagnostics.
export function mongoDiagnostics(error){
 const queue=[error],seen=new Set(),items=[];
 while(queue.length&&items.length<40){
  const item=queue.shift();if(!item||typeof item!=='object'||seen.has(item))continue;
  seen.add(item);items.push(item);queue.push(item.cause,item.reason,item.error);
  if(item.servers instanceof Map)for(const server of item.servers.values())queue.push(server.error);
  if(Array.isArray(item.errors))queue.push(...item.errors);
 }
 const codes=items.map(item=>item.code),text=items.map(item=>String(item.message||'')).join(' ');
 if(codes.some(code=>['ENOTFOUND','EAI_AGAIN','ENODATA','ESERVFAIL','ETIMEOUT'].includes(code)))return {category:'DNS',message:'Atlas DNS lookup failed.',hint:'Verify the Atlas Connect > Drivers hostname, cluster status and your DNS/network connection.'};
 if(codes.includes(18)||/bad auth|authentication failed|auth failed|SCRAM.*fail/i.test(text))return {category:'AUTHENTICATION',message:'Atlas authentication failed.',hint:'Check the Atlas Database Access user (not your Atlas website login), its password, and URL-encode special characters in the password.'};
 if(codes.includes(13))return {category:'AUTHORIZATION',message:'The database user lacks permission.',hint:'Check its roles for the configured MONGODB_DB in Atlas Database Access.'};
 if(codes.some(code=>/CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY/.test(String(code)))||/certificate|tls handshake|ssl routines/i.test(text))return {category:'TLS',message:'TLS verification or handshake failed.',hint:'Check system time, trusted certificates and antivirus/corporate TLS inspection. Keep TLS verification enabled.'};
 if(items.some(item=>item.name==='MongoParseError'||item.name==='MongoInvalidArgumentError'))return {category:'URI',message:'The MongoDB connection string is invalid.',hint:'Copy the Node.js Drivers URI into MONGODB_URI and replace the password placeholder with a URL-encoded password.'};
 if(codes.some(code=>['ECONNREFUSED','ETIMEDOUT','ECONNRESET','EHOSTUNREACH','ENETUNREACH'].includes(code))||items.some(item=>/MongoServerSelectionError|MongoNetwork/.test(item.name||'')))return {category:'NETWORK_OR_CLUSTER',message:'No usable MongoDB primary could be reached.',hint:'Check cluster status, Atlas Network Access for your current public IP, and firewall/VPN access to Atlas on port 27017. This result alone cannot identify which condition failed.'};
 return {category:'UNKNOWN',message:'MongoDB connection failed.',hint:'Verify the private connection settings, cluster status and Atlas access rules. Credentials and raw driver errors are intentionally omitted.'};
}
