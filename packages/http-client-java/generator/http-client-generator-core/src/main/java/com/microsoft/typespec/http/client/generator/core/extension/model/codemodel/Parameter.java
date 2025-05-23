// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

package com.microsoft.typespec.http.client.generator.core.extension.model.codemodel;

/**
 * Represents a discrete input for an operation.
 */
public class Parameter extends Value {
    private String clientDefaultValue;
    private Parameter.ImplementationLocation implementation;
    private Operation operation;
    private boolean flattened = false;
    private Parameter originalParameter;
    private Parameter groupedBy;
    private Property targetProperty;
    private String origin;
    private String summary;

    /**
     * Creates a new instance of the Parameter class.
     */
    public Parameter() {
    }

    /**
     * Gets the default value for the parameter in the client.
     *
     * @return The default value for the parameter in the client.
     */
    public String getClientDefaultValue() {
        return clientDefaultValue;
    }

    /**
     * Sets the default value for the parameter in the client.
     *
     * @param clientDefaultValue The default value for the parameter in the client.
     */
    public void setClientDefaultValue(String clientDefaultValue) {
        this.clientDefaultValue = clientDefaultValue;
    }

    /**
     * Gets the location of the parameter's implementation.
     *
     * @return The location of the parameter's implementation.
     */
    public Parameter.ImplementationLocation getImplementation() {
        return implementation;
    }

    /**
     * Sets the location of the parameter's implementation.
     *
     * @param implementation The location of the parameter's implementation.
     */
    public void setImplementation(Parameter.ImplementationLocation implementation) {
        this.implementation = implementation;
    }

    /**
     * Gets the operation that this parameter is used in.
     *
     * @return The operation that this parameter is used in.
     */
    public Operation getOperation() {
        return operation;
    }

    /**
     * Sets the operation that this parameter is used in.
     *
     * @param operation The operation that this parameter is used in.
     */
    public void setOperation(Operation operation) {
        this.operation = operation;
    }

    /**
     * Gets whether the parameter is flattened.
     *
     * @return Whether the parameter is flattened.
     */
    public boolean isFlattened() {
        return flattened;
    }

    /**
     * Sets whether the parameter is flattened.
     *
     * @param hidden Whether the parameter is flattened.
     */
    public void setFlattened(boolean hidden) {
        this.flattened = hidden;
    }

    /**
     * Gets the original parameter that this parameter is derived from.
     *
     * @return The original parameter that this parameter is derived from.
     */
    public Parameter getOriginalParameter() {
        return originalParameter;
    }

    /**
     * Sets the original parameter that this parameter is derived from.
     *
     * @param originalParameter The original parameter that this parameter is derived from.
     */
    public void setOriginalParameter(Parameter originalParameter) {
        this.originalParameter = originalParameter;
    }

    /**
     * Gets the property that this parameter is targeting.
     *
     * @return The property that this parameter is targeting.
     */
    public Property getTargetProperty() {
        return targetProperty;
    }

    /**
     * Sets the property that this parameter is targeting.
     *
     * @param targetProperty The property that this parameter is targeting.
     */
    public void setTargetProperty(Property targetProperty) {
        this.targetProperty = targetProperty;
    }

    /**
     * Gets the parameter that this parameter is grouped by.
     *
     * @return The parameter that this parameter is grouped by.
     */
    public Parameter getGroupedBy() {
        return groupedBy;
    }

    /**
     * Sets the parameter that this parameter is grouped by.
     *
     * @param groupedBy The parameter that this parameter is grouped by.
     */
    public void setGroupedBy(Parameter groupedBy) {
        this.groupedBy = groupedBy;
    }

    /**
     * The origin of the parameter.
     *
     * @return The origin of the parameter.
     */
    public String getOrigin() {
        return origin;
    }

    /**
     * Sets the origin of the parameter.
     *
     * @param origin The origin of the parameter.
     */
    public void setOrigin(String origin) {
        this.origin = origin;
    }

    @Override
    public String getSummary() {
        return summary;
    }

    @Override
    public void setSummary(String summary) {
        this.summary = summary;
    }

    /**
     * The location of the parameter's implementation.
     */
    public enum ImplementationLocation {
        /**
         * The parameter is implemented in the client.
         */
        CLIENT("Client"),

        /**
         * The parameter is implemented in the context.
         */
        CONTEXT("Context"),

        /**
         * The parameter is implemented in the method.
         */
        METHOD("Method");

        private final String value;

        ImplementationLocation(String value) {
            this.value = value;
        }

        @Override
        public String toString() {
            return this.value;
        }

        /**
         * The value of the location.
         *
         * @return The value of the location.
         */
        public String value() {
            return this.value;
        }

        /**
         * Parses a value to a location.
         *
         * @param value The value to parse.
         * @return The parsed location.
         * @throws IllegalArgumentException thrown if the value does not match any of the known locations.
         */
        public static Parameter.ImplementationLocation fromValue(String value) {
            if ("Client".equals(value)) {
                return CLIENT;
            } else if ("Context".equals(value)) {
                return CONTEXT;
            } else if ("Method".equals(value)) {
                return METHOD;
            } else {
                throw new IllegalArgumentException(value);
            }
        }
    }
}
