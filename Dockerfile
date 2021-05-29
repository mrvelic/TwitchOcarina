FROM node:lts-buster-slim AS node_base
FROM mcr.microsoft.com/dotnet/sdk:5.0-buster-slim AS build-env
COPY --from=node_base . .
WORKDIR /app

# Copy csproj and restore as distinct layers
COPY src/TwitchOcarina/*.csproj ./
RUN dotnet restore

# Copy everything else and build
COPY src/TwitchOcarina/ ./
ARG BUILD_NUMBER
RUN dotnet publish -c Release -o out

# Build runtime image
FROM mcr.microsoft.com/dotnet/aspnet:5.0
WORKDIR /app
COPY --from=build-env /app/out .
ENV DOTNET_ENVIRONMENT=Production
ENTRYPOINT ["dotnet", "TwitchOcarina.dll"]
