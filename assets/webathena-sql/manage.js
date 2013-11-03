function showConfirmDialog(database) {
    var deferred = Q.defer();

    var dialog = $("#drop-confirm-template").clone();
    dialog.removeAttr("id").removeAttr("hidden");

    dialog.find(".field-database").text(database);

    dialog.find(".part-cancel-button").click(function () {
        deferred.resolve(false);
        dialog.modal("hide");
    });
    dialog.find(".part-confirm-button").click(function () {
        deferred.resolve(true);
        dialog.modal("hide");
    });

    dialog.on("hidden", function () {
        // In case somehow bootstrap decided to dismiss it for us...
        if (Q.isPending(deferred.promise))
            deferred.resolve(false);
        dialog.remove();
    });

    $("body").append(dialog);
    dialog.modal("show");

    return deferred.promise;
}

function formatSize(bytes) {
    if (bytes == 0)
        return "0\xA0MB";
    var suffixes = ["bytes", "kB", "MB",
                    // Eh, why not? :-D
                    "GB", "TB", "PB", "EB", "ZB", "YB"];
    var index = 0;
    while (index + 1 < suffixes.length && bytes >= 1024) {
        index++;
        bytes /= 1024;
    }
    var bytesStr = bytes.toFixed(index ? 2 : 0);
    return bytesStr + "\xA0" + suffixes[index];
}

function createRow(name, size) {
    var tr = $("<tr>");
    tr.append($("<td>").append(
        $("<code>").addClass("noborder").text(name)));
    tr.append($("<td>").text(formatSize(size)));
    var button = $("<button>").attr("type", "button")
                              .addClass("btn btn-danger btn-small")
                              .text("Drop");
    button.click(function() {
        showConfirmDialog(name).then(function(result) {
            if (!result)
                return;

            // Kludge: the API wants short names, but gives back long
            // names.
            var locker = getCurrentLocker();
            if (name.substring(0, locker.length + 1) != locker + "+")
                throw new Error("Locker/DB name mismatch!");
            var shortName = name.substring(locker.length + 1);

            clearAlerts("manage-alert");
            showAlert("manage-alert", "Dropping database...", "Please wait.");
            sqlCommand(["database", "drop", locker, shortName]).finally(function() {
                clearAlerts("manage-alert");
            }).then(function() {
                refreshInfo();
            }, function(err) {
                // TODO(davidben): Distinguish UserError from others.
                showAlert("manage-alert", "Error", err, "alert-error");
            });
        }).done();
    });
    tr.append($("<td>").append(button));
    return tr;
}

function refreshInfo() {
    // TODO(davidben): Handle the case when you're not logged in, etc.
    var locker = getCurrentLocker();
    $(".field-locker-name").text(locker);
    clearAlerts("manage-alert");
    showAlert("manage-alert", "Loading...", "Please wait.");
    sqlCommand(["database", "list", locker]).finally(function() {
        clearAlerts("manage-alert");
    }).then(function(data) {
        var totalSize = 0;

        var tbody = $(".field-database-tbody");
        tbody.empty();
        var databases = data.databases.slice(0);
        databases.sort(function(a, b) {
            return a.name.localeCompare(b.name);
        });
        for (var i = 0; i < databases.length; i++) {
            totalSize += databases[i].size;
            tbody.append(createRow(databases[i].name, databases[i].size));
        }

        $(".field-used-size").text(formatSize(totalSize));
        $(".field-quota").text(formatSize(data.quota));
        $(".field-used-percent").text(((totalSize / data.quota) * 100).toFixed(1));
    }, function(err) {
        // TODO(davidben): Distinguish UserError from others.
        showAlert("manage-alert", "Error", err, "alert-error");
    }).done();
}

function setupForms() {
    var form = $("#database-create-form");
    form.submit(function(ev) {
        ev.preventDefault();
        var name = form.find(".field-database-name").val();
        if (!name)
            return;

        var locker = getCurrentLocker();

        clearAlerts("create-alert");
        showAlert("create-alert", "Creating database...", "Please wait.");
        form.find(":submit").attr("disabled", "");

        sqlCommand(["database", "create", locker, name]).finally(function() {
            form.find(":submit").removeAttr("disabled");
            clearAlerts("create-alert");
        }).then(function() {
            form.find(".field-database-name").val("");
            refreshInfo();
        }, function(err) {
            // TODO(davidben): Distinguish UserError from others.
            showAlert("create-alert", "Error", err, "alert-error");
        }).done();
    });
}

refreshInfo();
setupForms();
