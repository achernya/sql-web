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
            alert("Yeah, not implementing you yet.");
        }).done();
    });
    tr.append($("<td>").append(button));
    return tr;
}

function loadInfo() {
    var locker = getCurrentLocker();
    $(".field-locker-name").text(locker);
    sqlCommand(["database", "list", locker]).then(function(data) {
        var totalSize = 0;

        var tbody = $(".field-database-tbody");
        tbody.empty();
        for (var i = 0; i < data.databases.length; i++) {
            totalSize += data.databases[i].size;
            tbody.append(createRow(data.databases[i].name,
                                   data.databases[i].size));
        }

        $(".field-used-size").text(formatSize(totalSize));
        $(".field-quota").text(formatSize(data.quota));
        $(".field-used-percent").text(((totalSize / data.quota) * 100).toFixed(1));
    }, function(err) {
        // FIXME!
        alert(err);
    });
}

loadInfo();
