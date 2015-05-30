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

function NoCredentialsError() {
    this.message = "Not logged in";
};
NoCredentialsError.prototype = Object.create(Error.prototype);
NoCredentialsError.prototype.constructor = NoCredentialsError;
NoCredentialsError.prototype.name = "NoCredentialsError";

var REMCTL_PROXY = "https://ctlfish.mit.edu/socket";
function remctl(command) {
    var server = "sql.mit.edu";
    var peer = gss.Name.importName("host@" + server, gss.NT_HOSTBASED_SERVICE);
    var credential = getCachedTicket();
    if (!credential)
        return Q.reject(new NoCredentialsError());
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
        if (status !== 0 && status !== 1) {
            throw "Command exited with status: " + status;
        }
        return JSON.parse(flushStreams());
    });
}

function UserError(message) {
    this.message = message;
};
UserError.prototype = Object.create(Error.prototype);
UserError.prototype.constructor = UserError;
UserError.prototype.name = "UserError";

function sqlCommand(command) {
    return remctl(command).then(function (result) {
        if (result.status === 0) {
            return result;
        } else if (result.status === 1) {
            throw new UserError(result.error);
        } else if (result.status === 2) {
            throw new Error(result.error);
        } else {
            if (window.console && console.error)
                console.error(result);
            throw new Error("Unknown status: " + result.status);
        }
    });
}

function showAlert(basename, heading, body, style) {
    var alertTemplate = $("#alert-template");
    var alertPlaceholder = $("#" + basename + "-placeholder");
    if (alertPlaceholder.length > 0) {
        var alertNode = alertTemplate.clone().removeAttr("id");
        alertNode.find(".alert-template-head").text(heading);
        alertNode.find(".alert-template-body").text(body);
        alertNode.removeAttr("hidden");
        if (style) {
            alertNode.addClass(style);
        }
        alertPlaceholder.append(alertNode);
    }
}

function clearAlerts(basename) {
    $("#" + basename + "-placeholder").empty();
}

function registerModalListeners() {
    var cpw = $('#change-password');
    if (cpw) {
        cpw.unbind("submit");
        cpw.submit(function (e) {
            e.preventDefault();
            clearAlerts("password-alert");
            pw = cpw.find(".field-password").val();
            confirmPw = cpw.find(".field-confirmPassword").val()
            if (pw.length < 6) {
                showAlert("password-alert", "Error!", "Password is too short.", "alert-error");
                return false;
            }
            if (pw === confirmPw) {
                showAlert("password-alert", "Processing!", "Please wait.");
                cpw.find(":submit").attr("disabled", "");
                sqlCommand(["password", "set", getCurrentLocker(), pw]).finally(function () {
                    clearAlerts("password-alert");
                    cpw.find(":submit").removeAttr("disabled");
                }).then(function (result) {
                    showAlert("password-alert", "Success!", "Password updated.", "alert-success");
                }, function (err) {
                    showAlert("password-alert", "Error", "Failed to change password: " + err, "alert-error");
                    throw err;
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

        sqlCommand(["profile", "get", getCurrentLocker()]).finally(function () {
            clearAlerts("profile-alert");
        }).then(function (result) {
            // Re-enable input.
            profile.find("input").removeAttr("disabled");
            profile.find(":submit").removeAttr("disabled");

            // Fill in the form.
            profile.find(".field-user-fullname").val(result.fullname);
            profile.find(".field-user-email").val(result.email);

            // NOW hook up the form.
            profile.submit(function (e) {
                e.preventDefault();
                clearAlerts("profile-alert");

                var fullname = profile.find(".field-user-fullname").val();
                var email = profile.find(".field-user-email").val();
                var profileStr = JSON.stringify({
                    fullname: fullname,
                    email: email
                });

                showAlert("profile-alert", "Processing!", "Please wait.");
                cpw.find(":submit").attr("disabled", "");
                sqlCommand(["profile", "set", getCurrentLocker(), profileStr]).finally(function () {
                    clearAlerts("profile-alert");
                    cpw.find(":submit").removeAttr("disabled");
                }).then(function (result) {
                    showAlert("profile-alert", "Success!", "Profile updated.", "alert-success");
                }, function (err) {
                    showAlert("profile-alert", "Error", "Failed to change profile: " + err, "alert-error");
                    throw err;
                }).done();
                return false;
            });
        }, function (err) {
            showAlert("profile-alert", "Error", "Failed to get profile: " + err, "alert-error");
        }).done();

        profile.unbind("submit");
    }
}

$('#sql-modal').on('shown', registerModalListeners);
$('#sql-modal').on('hidden', function() {
    $(this).data('modal').$element.removeData();
})
