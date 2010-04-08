/**
 * Structures object and model data and provides abstractions for loading and
 * manipulating the data.
 *
 * @author Chris Moyer
 */

/**
 * Base model object
 *
 * @constructor
 */
botoweb.Model = function (name, href, methods, props) {

	var self = this;
	this._DEBUG_MODEL_INSTANCE = 1;
	this.name = name;
	this.href = href;
	this.methods = methods;
	this.ref_props = [];
	this.props = [];
	this.prop_map = {};
	this.local = false;
	this.objs = {};

	this.set_props = function(props) {
		var self = this;
		this.props = props;
		this.prop_map = {};

		$.each(this.props, function() {
			if (this.is_type('query', 'reference'))
				self.ref_props.push(this);

			self.prop_map[this.meta.name] = this;
		});
	}

	this.query_ldb = function(filters, fnc, opt) {
		opt = opt || {};

		var tbl = botoweb.ldb.tables[this.name];
		var query = new botoweb.sql.Query(tbl);

		query.apply_bw_filters(filters, tbl);

		function do_query (txn) {
			var total_results = 0;
			var page = 0;

			function next_page(txn) {
				function get_page(txn) {
					query.page(txn, function(results, page) {
						var data = $.map(results, function (row) { return row[0]; });

						if (opt.one) {
							if (data.length)
								data = data[0];
							else
								data = null;
						}

						return fnc(data, page, total_results, next_page);
					}, page++);
				}

				if (txn)
					get_page(txn);
				else
					botoweb.ldb.dbh.transaction(get_page);
			};

			query.count(txn, function (count) {
				total_results = count;
				next_page(txn);
			});
		}

		if (opt.txn)
			do_query(opt.txn);
		else
			botoweb.ldb.dbh.transaction(do_query);
	};

	this.find = function(filters, fnc, opt){
		if (!opt) opt = {};

		if (this.local && botoweb.ldb.dbh && !opt.no_ldb) {
			return this.query_ldb(filters, fnc, opt);
		}

		botoweb[(opt.query) ? 'query' : 'find'](botoweb.util.url_join(botoweb.env.base_url, this.href), filters, botoweb.env.model_names.join(','), fnc, opt);
	}

	this.query = function(query, fnc, opt) {
		return this.find(query, fnc, $.extend(opt, {query: 1}));
	}

	this.all = function(fnc, opt){
		return this.find([], fnc, opt);
	}

	this.count = function(filters, fnc, opt){
		if (!opt) opt = {};

		if (this.local && botoweb.ldb.dbh && !opt.no_ldb) {
			var tbl = botoweb.ldb.tables[this.name];
			var query = new botoweb.sql.Query(tbl.c.id);

			query.apply_bw_filters(filters, tbl);

			botoweb.ldb.dbh.transaction(function (txn) {
				query.count(txn, fnc);
			});

			return;
		}

		botoweb.count(botoweb.env.base_url + this.href, filters, fnc);
	};

	this.cache = function(obj) {
		return obj;
	}

	this.instance = function (data) {
		botoweb.Object.call(this, Math.uuidFast().toLowerCase(), self, data);
		this.unsaved = true;
	};

	this.get = function(id, fnc, opt){
		opt = opt || {};

		if (this.objs[id])
			return fnc(this.objs[id], false);

		if (this.local && botoweb.ldb.dbh && !opt.no_ldb) {
			opt.one = true;
			return this.query_ldb({id: id}, fnc, opt);
		}

		botoweb.get_by_id(botoweb.util.url_join(botoweb.env.base_url, this.href), id, fnc, opt.alert);
	}

	this.save = function(data, fnc){
		ref = botoweb.env.base_url + this.href;
		method = "POST";
		if("id" in data && typeof data.id != 'undefined'){
			ref += ("/" + data.id);
			delete data.id;
			method = "PUT";
		}
		return botoweb.save(ref, this.name, data, method, fnc);
	}

	//
	// Delete this object
	//
	this.del = function(id, fnc){
		return botoweb.del(botoweb.util.url_join(botoweb.env.base_url, this.href, id), function(x) {
			delete self.objs[id];
			if (fnc)
				fnc(x);
		});
	}

	this.toString = function () {
		return this.name;
	}

};
