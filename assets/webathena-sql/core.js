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

function getCurrentLocker() {
    if (!supportsLocalStorage()) {
	return;
    }
    // TODO implement this to actually work...
    return getCachedTicket().client.principalName.nameString[0];
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

var REMCTL_PROXY = "https://ctlfish-davidben.rhcloud.com:8443/socket";
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
	return arrayutils.toString(arr);
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

function showAlert(basename, heading, body, style) {
    var alertTemplate = document.getElementById("alert-template");
    var alertPlaceholder = document.getElementById(basename + "-placeholder");
    if (alertPlaceholder) {
	var alertNode = alertTemplate.cloneNode(true);
	alertNode.id = "";
	alertNode.getElementsByClassName("alert-template-head")[0].textContent = heading;
	alertNode.getElementsByClassName("alert-template-body")[0].textContent = body;
	alertNode.hidden = false;
	if (style) {
	    alertNode.classList.add(style);
	}
	alertPlaceholder.appendChild(alertNode);
    }
}

function registerModalListeners() {
    var cpw = $('#change-password');
    if (cpw) {
	cpw.unbind("submit");
	cpw.submit(function (e) {
	    e.preventDefault();
	    pw = $("#password").val();
	    confirmPw = $("#confirmPassword").val()
	    if (pw.length < 6) {
		showAlert("password-alert", "Error!", "Password is too short.", "alert-error");
		return false;
	    }
	    if (pw === confirmPw) {
		showAlert("password-alert", "Processing!", "Please wait.");
                cpw.find(":submit").attr("disabled", "");
		remctl(["password", "set", getCurrentLocker(), pw]).then(function (result) {
		    showAlert("password-alert", "Success!", "Password updated.", "alert-success");
		}, function (err) {
                    showAlert("password-alert", "Error", "Failed to change password: " + err, "alert-error");
                    throw err;
                }).finally(function () {
                    cpw.find(":submit").removeAttr("disabled");
                }).done();
		return false;
	    }
	    showAlert("password-alert", "Error", "Passwords do not match.", "alert-error");
	    return false;
	});
    }
    var profile = $('#change-profile');
    if (profile) {
        // Disable all input while we load up the profile.
        profile.find("input").attr("disabled", "");
        profile.find(":submit").attr("disabled", "");

	showAlert("profile-alert", "Loading...", "Please wait.");

        remctl(["profile", "get", getCurrentLocker()]).then(function (result) {
            profile.find("input").removeAttr("disabled");
            profile.find(":submit").removeAttr("disabled");

            profile.find("#user-fullname").val(result.fullname);
            profile.find("#user-email").val(result.email);
        }, function (err) {
            showAlert("profile-alert", "Error", "Failed to get profile: " + err, "alert-error");
        });

	profile.unbind("submit");
	profile.submit(function (e) {
	    e.preventDefault();
	});
    }
}

$('#sql-modal').on('shown', registerModalListeners);
$('#sql-modal').on('hidden', function() {
    $(this).data('modal').$element.removeData();
})
