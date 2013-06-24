function supportsLocalStorage() {
    try {
	return 'localStorage' in window && window['localStorage'] !== null;
    } catch (e) {
	return false;
    }
}

function getCachedTicket() {
    if (!supportsLocalStorage()) {
	return;
    }
    var storedTicket = localStorage["webathena.ticket"];
    if (!storedTicket) {
	return;
    }
    var session = krb.Session.fromDict(JSON.parse(storedTicket));
    if (session.isExpired()) {
	return;
    }
    return session;
}

function saveTicketToCache(ticket) {
    if (!supportsLocalStorage()) {
	return;
    }
    localStorage["webathena.ticket"] = JSON.stringify(ticket);
}

function destroyCachedTicket() {
    if (!supportsLocalStorage()) {
	return;
    }
    localStorage.removeItem("webathena.ticket");
}


function getTicket() {
    var deferred = Q.defer();
    var session = getCachedTicket();
    if (session) {
	deferred.resolve(session);
	return deferred.promise;
    }
    WinChan.open({
	url: "https://webathena.mit.edu/#!request_ticket_v1",
	relay_url: "https://webathena.mit.edu/relay.html",
	params: {
	    realm: 'ATHENA.MIT.EDU',
	    principal: ['host', 'sql.mit.edu'],
	}
    }, function (err, r) {
	console.log("got reply", err, r);
	if (err) {
	    deferred.reject(err);
	    return;
	}
	if (r.status !== "OK") {
	    deferred.reject(r);
	    return;
	}
	saveTicketToCache(r.session);
	session = krb.Session.fromDict(r.session);
	deferred.resolve(session);
    });
    return deferred.promise;
}


function updateLoginControls() {
    var notSignedIn = document.getElementById("not-signed-in");
    var myAccount = document.getElementById("my-account");
    var session = getCachedTicket();
    notSignedIn.hidden = !!session;
    myAccount.hidden = !session;
    if (session) {
	var username = document.getElementById("sql-username");
	username.textContent = session.client.principalName.nameString[0];
    }
}

