'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.validateSchema = validateSchema;
exports.assertValidSchema = assertValidSchema;

var _definition = require('./definition');

var _directives = require('./directives');

var _schema = require('./schema');

var _find = require('../jsutils/find');

var _find2 = _interopRequireDefault(_find);

var _typeComparators = require('../utilities/typeComparators');

var _GraphQLError = require('../error/GraphQLError');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } } /**
                                                                                                                                                           * Copyright (c) 2015-present, Facebook, Inc.
                                                                                                                                                           *
                                                                                                                                                           * This source code is licensed under the MIT license found in the
                                                                                                                                                           * LICENSE file in the root directory of this source tree.
                                                                                                                                                           *
                                                                                                                                                           * 
                                                                                                                                                           */

/**
 * Implements the "Type Validation" sub-sections of the specification's
 * "Type System" section.
 *
 * Validation runs synchronously, returning an array of encountered errors, or
 * an empty array if no errors were encountered and the Schema is valid.
 */
function validateSchema(schema) {
  // First check to ensure the provided value is in fact a GraphQLSchema.
  if (!(schema instanceof _schema.GraphQLSchema)) {
    if (!schema) {
      throw new Error('Must provide schema.');
    }

    // Provide as descriptive an error as possible when attempting to use a
    // schema cross-realm.
    if (Object.getPrototypeOf(schema).constructor.name === 'GraphQLSchema') {
      throw new Error('Cannot use a GraphQLSchema from another module or realm.\n\nEnsure that there is only one instance of "graphql" in the node_modules\ndirectory. If different versions of "graphql" are the dependencies of other\nrelied on modules, use "resolutions" to ensure only one version is installed.\n\nhttps://yarnpkg.com/en/docs/selective-version-resolutions\n\nDuplicate "graphql" modules cannot be used at the same time since different\nversions may have different capabilities and behavior. The data from one\nversion used in the function from another could produce confusing and\nspurious results.');
    } else {
      throw new Error('Schema must be an instance of GraphQLSchema. ' + ('Received: ' + String(schema)));
    }
  }

  // If this Schema has already been validated, return the previous results.
  if (schema.__validationErrors) {
    return schema.__validationErrors;
  }

  // Validate the schema, producing a list of errors.
  var context = new SchemaValidationContext();
  validateRootTypes(context, schema);
  validateDirectives(context, schema);
  validateTypes(context, schema);

  // Persist the results of validation before returning to ensure validation
  // does not run multiple times for this schema.
  var errors = context.getErrors();
  schema.__validationErrors = errors;
  return errors;
}

/**
 * Utility function which asserts a schema is valid by throwing an error if
 * it is invalid.
 */
function assertValidSchema(schema) {
  var errors = validateSchema(schema);
  if (errors.length !== 0) {
    throw new Error(errors.map(function (error) {
      return error.message;
    }).join('\n\n'));
  }
}

var SchemaValidationContext = function () {
  function SchemaValidationContext() {
    _classCallCheck(this, SchemaValidationContext);

    this._errors = [];
  }

  SchemaValidationContext.prototype.reportError = function reportError(message, nodes) {
    var _nodes = (Array.isArray(nodes) ? nodes : [nodes]).filter(Boolean);
    this._errors.push(new _GraphQLError.GraphQLError(message, _nodes));
  };

  SchemaValidationContext.prototype.getErrors = function getErrors() {
    return this._errors;
  };

  return SchemaValidationContext;
}();

function validateRootTypes(context, schema) {
  var queryType = schema.getQueryType();
  if (!queryType) {
    context.reportError('Query root type must be provided.', schema.astNode);
  } else if (!(queryType instanceof _definition.GraphQLObjectType)) {
    context.reportError('Query root type must be Object type but got: ' + String(queryType) + '.', getOperationTypeNode(schema, queryType, 'query'));
  }

  var mutationType = schema.getMutationType();
  if (mutationType && !(mutationType instanceof _definition.GraphQLObjectType)) {
    context.reportError('Mutation root type must be Object type if provided but got: ' + (String(mutationType) + '.'), getOperationTypeNode(schema, mutationType, 'mutation'));
  }

  var subscriptionType = schema.getSubscriptionType();
  if (subscriptionType && !(subscriptionType instanceof _definition.GraphQLObjectType)) {
    context.reportError('Subscription root type must be Object type if provided but got: ' + (String(subscriptionType) + '.'), getOperationTypeNode(schema, subscriptionType, 'subscription'));
  }
}

function getOperationTypeNode(schema, type, operation) {
  var astNode = schema.astNode;
  var operationTypeNode = astNode && astNode.operationTypes.find(function (operationType) {
    return operationType.operation === operation;
  });
  return operationTypeNode ? operationTypeNode.type : type && type.astNode;
}

function validateDirectives(context, schema) {
  var directives = schema.getDirectives();
  directives.forEach(function (directive) {
    if (!(directive instanceof _directives.GraphQLDirective)) {
      context.reportError('Expected directive but got: ' + String(directive) + '.', directive && directive.astNode);
    }
  });
}

function validateTypes(context, schema) {
  var typeMap = schema.getTypeMap();
  Object.keys(typeMap).forEach(function (typeName) {
    var type = typeMap[typeName];

    // Ensure all provided types are in fact GraphQL type.
    if (!(0, _definition.isType)(type)) {
      context.reportError('Expected GraphQL type but got: ' + String(type) + '.', type && type.astNode);
    }

    // Ensure objects implement the interfaces they claim to.
    if (type instanceof _definition.GraphQLObjectType) {
      var implementedTypeNames = Object.create(null);

      type.getInterfaces().forEach(function (iface) {
        if (implementedTypeNames[iface.name]) {
          context.reportError(type.name + ' must declare it implements ' + iface.name + ' only once.', getAllImplementsInterfaceNode(type, iface));
        }
        implementedTypeNames[iface.name] = true;
        validateObjectImplementsInterface(context, schema, type, iface);
      });
    }
  });
}

function validateObjectImplementsInterface(context, schema, object, iface) {
  if (!(iface instanceof _definition.GraphQLInterfaceType)) {
    context.reportError(String(object) + ' must only implement Interface types, it cannot ' + ('implement ' + String(iface) + '.'), getImplementsInterfaceNode(object, iface));
    return;
  }

  var objectFieldMap = object.getFields();
  var ifaceFieldMap = iface.getFields();

  // Assert each interface field is implemented.
  Object.keys(ifaceFieldMap).forEach(function (fieldName) {
    var objectField = objectFieldMap[fieldName];
    var ifaceField = ifaceFieldMap[fieldName];

    // Assert interface field exists on object.
    if (!objectField) {
      context.reportError('"' + iface.name + '" expects field "' + fieldName + '" but "' + object.name + '" ' + 'does not provide it.', [getFieldNode(iface, fieldName), object.astNode]);
      // Continue loop over fields.
      return;
    }

    // Assert interface field type is satisfied by object field type, by being
    // a valid subtype. (covariant)
    if (!(0, _typeComparators.isTypeSubTypeOf)(schema, objectField.type, ifaceField.type)) {
      context.reportError(iface.name + '.' + fieldName + ' expects type ' + ('"' + String(ifaceField.type) + '" but ' + object.name + '.' + fieldName + ' is ') + ('type "' + String(objectField.type) + '".'), [getFieldTypeNode(iface, fieldName), getFieldTypeNode(object, fieldName)]);
    }

    // Assert each interface field arg is implemented.
    ifaceField.args.forEach(function (ifaceArg) {
      var argName = ifaceArg.name;
      var objectArg = (0, _find2.default)(objectField.args, function (arg) {
        return arg.name === argName;
      });

      // Assert interface field arg exists on object field.
      if (!objectArg) {
        context.reportError(iface.name + '.' + fieldName + ' expects argument "' + argName + '" but ' + (object.name + '.' + fieldName + ' does not provide it.'), [getFieldArgNode(iface, fieldName, argName), getFieldNode(object, fieldName)]);
        // Continue loop over arguments.
        return;
      }

      // Assert interface field arg type matches object field arg type.
      // (invariant)
      // TODO: change to contravariant?
      if (!(0, _typeComparators.isEqualType)(ifaceArg.type, objectArg.type)) {
        context.reportError(iface.name + '.' + fieldName + '(' + argName + ':) expects type ' + ('"' + String(ifaceArg.type) + '" but ') + (object.name + '.' + fieldName + '(' + argName + ':) is type ') + ('"' + String(objectArg.type) + '".'), [getFieldArgTypeNode(iface, fieldName, argName), getFieldArgTypeNode(object, fieldName, argName)]);
      }

      // TODO: validate default values?
    });

    // Assert additional arguments must not be required.
    objectField.args.forEach(function (objectArg) {
      var argName = objectArg.name;
      var ifaceArg = (0, _find2.default)(ifaceField.args, function (arg) {
        return arg.name === argName;
      });
      if (!ifaceArg && objectArg.type instanceof _definition.GraphQLNonNull) {
        context.reportError(object.name + '.' + fieldName + '(' + argName + ':) is of required type ' + ('"' + String(objectArg.type) + '" but is not also provided by the ') + ('interface ' + iface.name + '.' + fieldName + '.'), [getFieldArgTypeNode(object, fieldName, argName), getFieldNode(iface, fieldName)]);
      }
    });
  });
}

function getImplementsInterfaceNode(type, iface) {
  return getAllImplementsInterfaceNode(type, iface)[0];
}

function getAllImplementsInterfaceNode(type, iface) {
  var implementsNodes = [];
  var astNodes = [type.astNode].concat(type.extensionASTNodes || []);
  for (var i = 0; i < astNodes.length; i++) {
    var astNode = astNodes[i];
    if (astNode && astNode.interfaces) {
      astNode.interfaces.forEach(function (node) {
        if (node.name.value === iface.name) {
          implementsNodes.push(node);
        }
      });
    }
  }
  return implementsNodes;
}

function getFieldNode(type, fieldName) {
  var astNodes = [type.astNode].concat(type.extensionASTNodes || []);
  for (var i = 0; i < astNodes.length; i++) {
    var astNode = astNodes[i];
    var fieldNode = astNode && astNode.fields && astNode.fields.find(function (node) {
      return node.name.value === fieldName;
    });
    if (fieldNode) {
      return fieldNode;
    }
  }
}

function getFieldTypeNode(type, fieldName) {
  var fieldNode = getFieldNode(type, fieldName);
  return fieldNode && fieldNode.type;
}

function getFieldArgNode(type, fieldName, argName) {
  var fieldNode = getFieldNode(type, fieldName);
  return fieldNode && fieldNode.arguments && fieldNode.arguments.find(function (node) {
    return node.name.value === argName;
  });
}

function getFieldArgTypeNode(type, fieldName, argName) {
  var fieldArgNode = getFieldArgNode(type, fieldName, argName);
  return fieldArgNode && fieldArgNode.type;
}