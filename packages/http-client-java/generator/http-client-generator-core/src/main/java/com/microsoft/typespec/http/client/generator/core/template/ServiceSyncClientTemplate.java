// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

package com.microsoft.typespec.http.client.generator.core.template;

import com.microsoft.typespec.http.client.generator.core.extension.plugin.JavaSettings;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.Annotation;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.AsyncSyncClient;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.ClassType;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.ClientAccessorMethod;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.ClientBuilder;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.ClientMethod;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.ConvenienceMethod;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.GenericType;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.MethodGroupClient;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.ServiceClient;
import com.microsoft.typespec.http.client.generator.core.model.javamodel.JavaClass;
import com.microsoft.typespec.http.client.generator.core.model.javamodel.JavaContext;
import com.microsoft.typespec.http.client.generator.core.model.javamodel.JavaFile;
import com.microsoft.typespec.http.client.generator.core.model.javamodel.JavaVisibility;
import com.microsoft.typespec.http.client.generator.core.util.ClientModelUtil;
import com.microsoft.typespec.http.client.generator.core.util.TemplateUtil;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Template to create a synchronous client.
 */
public class ServiceSyncClientTemplate implements IJavaTemplate<AsyncSyncClient, JavaFile> {

    private static final ServiceSyncClientTemplate INSTANCE = new ServiceSyncClientTemplate();

    protected ServiceSyncClientTemplate() {
    }

    public static ServiceSyncClientTemplate getInstance() {
        return INSTANCE;
    }

    @Override
    public final void write(AsyncSyncClient syncClient, JavaFile javaFile) {
        final ServiceClient serviceClient = syncClient.getServiceClient();

        JavaSettings settings = JavaSettings.getInstance();
        final String syncClassName = syncClient.getClassName();
        final MethodGroupClient methodGroupClient = syncClient.getMethodGroupClient();
        final boolean wrapServiceClient = methodGroupClient == null;
        final String builderPackageName = ClientModelUtil.getServiceClientBuilderPackageName(serviceClient);
        final String builderClassName = serviceClient.getInterfaceName() + ClientModelUtil.getBuilderSuffix();
        final boolean samePackageAsBuilder = builderPackageName.equals(syncClient.getPackageName());
        final JavaVisibility constructorVisibility
            = samePackageAsBuilder ? JavaVisibility.PackagePrivate : JavaVisibility.Public;
        ClientBuilder rootClientBuilder = ServiceAsyncClientTemplate.getClientBuilder(syncClient);

        Set<String> imports = new HashSet<>();
        if (wrapServiceClient) {
            serviceClient.addImportsTo(imports, true, false, settings);
            imports.add(serviceClient.getPackage() + "." + serviceClient.getClassName());
        } else {
            methodGroupClient.addImportsTo(imports, true, settings);
            imports.add(methodGroupClient.getPackage() + "." + methodGroupClient.getClassName());
        }
        imports.add(builderPackageName + "." + builderClassName);
        if (rootClientBuilder != null) {
            rootClientBuilder.addImportsTo(imports, false);
        }
        addServiceClientAnnotationImport(imports);

        for (ClientAccessorMethod clientAccessorMethod : serviceClient.getClientAccessorMethods()) {
            clientAccessorMethod.addImportsTo(imports, false);
        }

        Templates.getConvenienceSyncMethodTemplate().addImports(imports, syncClient.getConvenienceMethods());

        if (!JavaSettings.getInstance().isAzureV1()) {
            ClassType.INSTRUMENTATION.addImportsTo(imports, false);
            ClassType.SDK_INSTRUMENTATION_OPTIONS.addImportsTo(imports, false);
        }

        javaFile.declareImport(imports);
        javaFile.javadocComment(comment -> comment.description(String
            .format("Initializes a new instance of the synchronous %1$s type.", serviceClient.getInterfaceName())));

        if (rootClientBuilder != null) {
            javaFile.annotation(String.format("ServiceClient(builder = %s.class)", rootClientBuilder.getClassName()));
        }
        javaFile.publicFinalClass(syncClassName, classBlock -> {
            writeClass(syncClient, classBlock, constructorVisibility);

            if (JavaSettings.getInstance().isUseClientLogger()) {
                TemplateUtil.addClientLogger(classBlock, syncClassName, javaFile.getContents());
            }
        });
    }

    /**
     * Extension to write the sync client class.
     *
     * @param syncClient the sync client
     * @param classBlock the class block to write
     * @param constructorVisibility the visibility of class constructor
     */
    protected void writeClass(AsyncSyncClient syncClient, JavaClass classBlock, JavaVisibility constructorVisibility) {
        final ServiceClient serviceClient = syncClient.getServiceClient();
        final MethodGroupClient methodGroupClient = syncClient.getMethodGroupClient();
        final boolean wrapServiceClient = methodGroupClient == null;

        // Add service client member
        addGeneratedAnnotation(classBlock);
        if (wrapServiceClient) {
            classBlock.privateFinalMemberVariable(serviceClient.getClassName(), "serviceClient");
        } else {
            classBlock.privateFinalMemberVariable(methodGroupClient.getClassName(), "serviceClient");
        }

        final boolean writeInstrumentation = !JavaSettings.getInstance().isAzureV1();
        if (writeInstrumentation) {
            classBlock.privateFinalMemberVariable(ClassType.INSTRUMENTATION.getName(), "instrumentation");
        }

        // Service Client Constructor
        classBlock.javadocComment(comment -> {
            comment.description(String.format("Initializes an instance of %1$s class.", syncClient.getClassName()));
            comment.param("serviceClient", "the service client implementation.");
            if (writeInstrumentation) {
                comment.param("instrumentation", "the instrumentation instance.");
            }
        });
        addGeneratedAnnotation(classBlock);

        String name = wrapServiceClient ? serviceClient.getClassName() : methodGroupClient.getClassName();

        classBlock.constructor(constructorVisibility,
            String.format("%1$s(%2$s %3$s%4$s)", syncClient.getClassName(), name, "serviceClient",
                writeInstrumentation ? ", " + ClassType.INSTRUMENTATION.getName() + " instrumentation" : ""),
            constructorBlock -> {
                constructorBlock.line("this.serviceClient = serviceClient;");
                if (writeInstrumentation) {
                    constructorBlock.line("this.instrumentation = instrumentation;");
                }
            });

        ServiceAsyncClientTemplate.writeSubClientAccessors(serviceClient, classBlock, false);

        writeMethods(syncClient, classBlock);
    }

    /**
     * Extension to write the sync client methods.
     *
     * @param syncClient the sync client
     * @param classBlock the class block to write
     */
    protected void writeMethods(AsyncSyncClient syncClient, JavaClass classBlock) {
        final ServiceClient serviceClient = syncClient.getServiceClient();
        final MethodGroupClient methodGroupClient = syncClient.getMethodGroupClient();

        final boolean useMethodGroupClient = methodGroupClient != null;
        List<ClientMethod> clientMethods = serviceClient.getClientMethods();
        if (useMethodGroupClient) {
            clientMethods = methodGroupClient.getClientMethods();
        }

        clientMethods.stream()
            .filter(clientMethod -> clientMethod.getMethodVisibility() == JavaVisibility.Public)
            .filter(clientMethod -> !clientMethod.isImplementationOnly())
            .filter(clientMethod -> !clientMethod.getType().name().contains("Async"))
            .forEach(clientMethod -> {
                writeMethod(clientMethod, classBlock);
            });

        writeConvenienceMethods(syncClient.getConvenienceMethods(), classBlock);

        ServiceAsyncClientTemplate.addEndpointMethod(classBlock, syncClient.getClientBuilder(), serviceClient,
            this.clientReference());
    }

    /**
     * Extension for client reference. Usually be either "this.serviceClient" or "this.client".
     *
     * @return the code for client reference.
     */
    protected String clientReference() {
        return "this.serviceClient";
    }

    /**
     * Extension to write the sync client method.
     *
     * @param clientMethod the client method in implementation class
     * @param classBlock the class block to write
     */
    protected void writeMethod(ClientMethod clientMethod, JavaClass classBlock) {
        Templates.getWrapperClientMethodTemplate().write(clientMethod, classBlock);
    }

    private void addServiceClientAnnotationImport(Set<String> imports) {
        Annotation.SERVICE_CLIENT.addImportsTo(imports);
        Annotation.GENERATED.addImportsTo(imports);
        Annotation.METADATA.addImportsTo(imports);
        Annotation.METADATA_PROPERTIES.addImportsTo(imports);
    }

    protected void addGeneratedAnnotation(JavaContext classBlock) {
        classBlock.annotation(Annotation.GENERATED.getName());
    }

    private void writeConvenienceMethods(List<ConvenienceMethod> convenienceMethods, JavaClass classBlock) {
        Set<GenericType> typeReferenceStaticClasses = new HashSet<>();

        convenienceMethods.forEach(
            m -> Templates.getConvenienceSyncMethodTemplate().write(m, classBlock, typeReferenceStaticClasses));

        // static variables for TypeReference<T>
        for (GenericType typeReferenceStaticClass : typeReferenceStaticClasses) {
            addGeneratedAnnotation(classBlock);
            TemplateUtil.writeTypeReferenceStaticVariable(classBlock, typeReferenceStaticClass);
        }
    }
}
