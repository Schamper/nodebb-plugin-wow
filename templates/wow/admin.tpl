<div class="row">
    <div class="col-md-12">
        <h1>WoW Guild Integration
            <button class="btn btn-success btn-xs pull-right save">Save</button>
        </h1>
    </div>
</div>

<div class="row">
    <form class="form" id="wowAdminForm">
        <div class="col-xs-6 pull-left">
            <h3>General settings</h3>

            <div class="form-group">
                <label for="apiKey">API key</label>
                <input type="text" data-key="variables.apiKey" class="form-control" id="apiKey">
            </div>

            <div class="form-group">
                <label for="realmName">Realm</label>
                <input type="text" data-key="variables.realm" class="form-control" id="realmName">
            </div>

            <div class="form-group">
                <label for="cronPattern">Cron pattern for data syncing.</label>
                <input type="text" data-key="variables.cronPattern" class="form-control" id="cronPattern">
                <p class="help-block">Make sure this is a valid pattern!</p>
                <button data-func="syncNow" class="btn btn-default" type="button">Sync now</button>
            </div>

            <div class="form-group">
                <label for="thumbnailBaseUrl">Thumbnail base URL</label>
                <input type="text" data-key="variables.thumbnailBaseUrl" class="form-control" id="thumbnailBaseUrl">
                <p class="help-block">Only change this if you know what you are doing!</p>
            </div>
        </div>
        <div class="col-xs-6 pull-left">
            <h3>Guild user group mapping</h3>

            <div class="form-group">
                <label for="guildName">Guild</label>
                <input type="text" class="form-control" id="guildName">
            </div>

            <div class="form-group">
                <label for="guildGroup">Group</label>
                <select class="form-control" id="guildGroup">
                    <!-- BEGIN groups -->
                    <option value="{groups.name}">{groups.name}</option>
                    <!-- END groups -->
                </select>
            </div>

            <button data-func="add" data-type="guild" class="btn btn-default" type="button">Add</button>

            <hr>

            <div data-list="guild">

            </div>
        </div>

        <input type="text" data-key="mappings.guild" class="hidden">
    </form>
</div>

<script>
    require(['settings'], function (settings) {
        var wrapper = $('#wowAdminForm'),
            lists = {
                guild: {}
            },
            tpl = '' +
                '<div data-slug="{slug}" class="panel panel-default">' +
                    '<div class="panel-heading">' +
                        '<strong>Guild:</strong> {name} -- ' +
                        '<strong>Group:</strong> {group}' +
                        '<div data-func="remove" class="pull-left pointer">' +
                            '<span>' +
                                '<i class="fa fa-times"></i>' +
                            '</span>&nbsp;' +
                        '</div>' +
                        '<div class="pull-right">' +
                            '<span>' +
                                //'<img height="20" src="http://image.eveonline.com/{type}/{id}_30.png">' +
                            '</span>' +
                        '</div>' +
                    '</div>' +
                '</div>';

        settings.sync('wow', wrapper, function() {
            for (var l in lists) {
                if (lists.hasOwnProperty(l)) {
                    lists[l] = $('[data-key="mappings.' + l + '"]').val();

                    if (lists[l].length > 0) {
                        lists[l] = JSON.parse(lists[l]);
                        $('[data-list="' + l + '"]').html(makeHTML(lists[l], l));
                    } else {
                        lists[l] = {};
                    }
                }
            }

            function makeHTML(list, type) {
                var html = '';
                for (var a in list) {
                    if (list.hasOwnProperty(a)) {
                        html += templates.parse(tpl, {
                            slug: a,
                            name: list[a].name,
                            group: list[a].group,
                            type: type
                        });
                    }
                }
                return html;
            }
        });

        $('.save').click(function(event) {
            event.preventDefault();
            for (var l in lists) {
                if (lists.hasOwnProperty(l)) {
                    $('[data-key="mappings.' + l + '"]').val(JSON.stringify(lists[l]));
                }
            }
            settings.persist('wow', wrapper, function(){
                socket.emit('admin.plugins.wow.sync');
            });
        });

        $('[data-func="add"]').click(function(event) {
            var el = $(event.currentTarget),
                type = el.data('type'),
                name = $('#' + type + 'Name').val(),
                group = $('#' + type + 'Group').val(),
                slug = utils.slugify(name);

            if (!lists[type].hasOwnProperty(slug)) {
                $('[data-list="' + type + '"]').append(templates.parse(tpl, {
                    slug: slug,
                    name: name,
                    group: group,
                    type: type
                }));

                lists[type][slug] = {
                    name: name,
                    group: group
                };
            }
        });

        $('[data-func="syncNow"]').click(function(event) {
            socket.emit('plugins.wow.syncNow', null, function(err, count) {
                if (err) {
                    app.alertError('Something went wrong, check the logs.');
                } else {
                    app.alertSuccess('Updated ' + count + ' users.');
                }
            });
        });

        $('[data-list]').on('click', '[data-func="remove"]', function(event) {
            var el = $(event.currentTarget),
                type = el.parents('[data-list]').data('list'),
                slug = el.parents('[data-slug]').data('slug') + '';

            el.parents('[data-slug]').remove();

            delete lists[type][slug];
        });
    });
</script>