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

document.getElementById("not-signed-in").addEventListener("click", function (e) {
    e.preventDefault();
    getTicket().then(function(session) {
        updateLoginControls();
    });
});
document.getElementById("log-out").addEventListener("click", function (e) {
    e.preventDefault();
    destroyCachedTicket();
    updateLoginControls();
});

!function ($) {
    $(function() {
	updateLoginControls();
    })
}(window.jQuery)

var REMCTL_PROXY = "https://ctlfish-davidben.rhcloud.com:8443";
function remctl(command) {
    var server = "primary-key.mit.edu";
    var peer = gss.Name.importName("host@" + server, gss.NT_HOSTBASED_SERVICE);
    var credential = getCachedTicket();
    var session = new RemctlSession(REMCTL_PROXY, peer, credential, server);
    var streams = { };

    function flushStreams() {
	var overallLength = 0;
	for (var i = 0; (i < chunks.length); i++) {
	    overallLength += chunks[i].length;
	}
	var arr = new Uint8Array(overallLength);
	overallLength = 0;
	for (var i = 0; (i < chunks.length); i++) {
	    arr.set(chunks[i], overallLength);
	    overallLength += chunks[i].length;
	}
	return arrayutils.toUTF16(arr);
    }

    var chunks = [ ];
    return session.ready().then(function() {
        return session.command(command, function(stream, data) {
	    chunks.push(data);
        });
    }).then(function(status) {
        if (status) {
            throw "Command exited with status: " + status;
        }
        return JSON.parse(flushStreams());
    });
}

window.addEventListener("hashchange", function(ev) {
    switch (location.hash) {
    case "":
    case "#":
	// This is the hash that we changed to after we processed some
	// event. Ignore it.
	break;
    case "#profile":
	console.log("Got a profile click");
	remctl(["account", "whoami"]).then(function (result) {
	    console.log(result);
	}).done();
	break;
    default:
	console.log("Unknown hash '" + location.hash + "' encountered");
    }
});
