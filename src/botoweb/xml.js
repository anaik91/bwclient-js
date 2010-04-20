/**
 * JavaScript library used to parse XML received from botoweb.
 *
 * @author Ian Paterson
 */
(function () {

botoweb.xml = {
	/**
	 * Parses API XML that defines a model's properties.
	 *
	 * @return The corresponding model
	 * @type botoweb.Model
	 */
	to_model: function (xml) {
		xml = $(xml);

		var methods = {};

		// Parse method names and descriptions
		xml.find('methods *').each(function () {
			methods[this.nodeName] = $(this).text()
		});

		var model = new botoweb.Model(
			xml.attr('name'),
			xml.find('href:first').text(),
			methods
		);

		model.set_props(xml.find('properties property').map(function () {
			var tags = $(this);
			var opt = {};

			// Pull attributes from the property node
			var map = {
				item_type: 'item_type',
				max_length: 'max_length',
				min_value: 'min',
				max_value: 'max',
				ref_name: 'reference_name',
				href: 'href'
			};

			$.each(map, function (a, b) {
				if (tags.attr(b) != undefined)
					opt[a] = tags.attr(b);
			});

			if (opt.ref_name)
				opt.refs = opt.ref_name.split(',');

			// Pull text content of children of the property node
			map = {
				label: 'description',
				def: 'default'
			};

			$.each(map, function (a, b) {
				var node = tags.find(b);

				if (node.length)
					opt[a] = node.text();
			});

			// Get key value maps for multiple choice properties
			map = {
				choices: 'choice'
			};

			$.each(map, function (a, b) {
				var nodes = tags.find(b);

				if (!nodes.length)
					return;

				opt[a] = [];

				nodes.each(function () {
					opt[a].push({value: $(this).attr('value'), name: $(this).text()});
				});
			});

			var prop = new botoweb.Property(
				tags.attr('name'),
				tags.attr('type'),
				(tags.attr('perm') || '').split(' '),
				model,
				opt
			);

			return prop;
		}));

		return model;
	},

	/**
	 * Parses XML that defines an object's properties. Data is parsed according
	 * to the model definition to ensure consistent representation of all data
	 * types.
	 *
	 * @return The corresponding object
	 * @type botoweb.Object
	 */
	to_obj: function(xml, opt) {
		if (!opt) opt = {};

		xml = $(xml);

		var model = botoweb.env.models[opt.item_type || xml.get(0).tagName];

		// If the object is cached, return it unless we are reloading the object
		if (!opt.no_cache && model.objs[xml.attr('id')])
			return model.objs[xml.attr('id')];

		var data = {};

		if (!opt.minimal_parse) {
			if(!model){
				console.error("Model not found: " + xml.get(0).tagName);
				return;
			}
			$.each(model.props, function() {
				// May match more than one!
				var tags = xml.find('> ' + this.meta.name);

				var d = null;

				if (this.is_type('reference', 'blob', 'query')) {
					d = tags.map(function (i, tag) {
						tag = $(tag);
						return {
							// The value is undefined until the object is loaded
							val: undefined,

							href: tag.attr('href'),
							type: tag.attr('item_type'),
							id: tag.attr('id')
						};
					});
				}

				else if (this.is_type('complexType')) {
					d = tags.children().map(function(i, tag) {
						tag = $(tag);
						return {
							key: tag.attr('name'),
							type: tag.attr('type'),
							val: tag.text()
						};
					});
				}

				else if (this.is_type('boolean')) {
					d = tags.map(function(i, tag) {
						switch ($(tag).text()) {
							case 'True':
								return { val: '1' };
							case 'False':
								return { val: '0' };
						}
						return { val: null };
					});
				}

				else {
					d = tags.map(function(i, tag) {
						return { val: $(tag).text() };
					});
				}

				// Less content for the next query
				tags.remove();

				// Create an instance once the data is gathered, any data that
				// is missing will be filled with defaults by the constructor.
				data[this.meta.name] = new this.instance($.makeArray(d));
			});
		}

		return new botoweb.Object(xml.attr('id'), model, data, opt);
	},

	from_obj: function (model_name, data) {
		var doc = document.implementation.createDocument('', model_name, null);
		var obj = doc.documentElement;
		var model = botoweb.env.models[model_name];

		$.each(data, function (name, val) {
			if (val == undefined)
				return;

			if (!(name in model.prop_map) && name != 'id')
				return;

			var model_prop = model.prop_map[name] || {meta: {}};
			var node = $(doc.createElement(name));

			node.attr('type', model_prop.meta.item_type || 'string');

			var type = 'def';

			if (model_prop)
				type = model_prop.meta.type;

			($xml.to_xml[type] || $xml.to_xml.def)(val, node, obj, doc);
		});

		return doc;
	},

	to_xml: {
		def: function (val, node, parent) {
			$.each(val, function () {
				if (this.type) {
					node.attr('type', this.type);
				}

				// Default integers to 0. NOTE: this makes it impossible to
				// determine whether the user typed 0 or left the field blank.
				if (this.type == 'integer' && !this.val) {
					this.val = '0';
				}

				node.clone().text($util.normalize_string(this.id || this.val || '')).appendTo(parent);
			});
		},
		complexType: function (val, node, parent, doc) {
			node.attr('type', 'dict');
			$.each(val, function () {
				$(doc.createElement('mapping')).attr({
					name: $util.normalize_string(this.key),
					type: 'string'
				})
				.text($util.normalize_string(this.val)).appendTo(node);
			});
			node.appendTo(parent);
		},
		boolean: function (val, node, parent) {
			node.attr('type', 'boolean');

			$.each(val, function () {
				var v = '';

				if (this.val == 1)
					v = 'True';
				else if (this.val == 0)
					v = 'False';

				node.clone().text(v).appendTo(parent);
			});
		},
		dateTime: function (val, node, parent) {
			node.attr('type', 'dateTime');

			$.each(val, function () {
				var ts = '';

				if (this.val)
					ts = $util.timestamp(this.val);

				node.clone().text(ts).appendTo(parent);
			});
		},
	}
};

var $xml = botoweb.xml;
var $env = botoweb.env;
var $util = botoweb.util;
})();
