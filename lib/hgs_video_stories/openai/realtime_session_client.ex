defmodule HgsVideoStories.OpenAI.RealtimeSessionClient do
  @moduledoc false

  @type openai_session :: %{
          required(:ephemeral_key) => String.t(),
          required(:expires_at) => String.t() | integer() | nil,
          required(:model) => String.t(),
          required(:turn_detection) => String.t() | nil
        }

  @callback create_session(map()) :: {:ok, openai_session()} | {:error, atom(), String.t()}

  def create_session(params) when is_map(params) do
    api_key = get_config(:api_key)

    with true <- is_binary(api_key) and api_key != "",
         {:ok, response} <-
           Req.post(
             url: "#{get_config(:base_url)}/v1/realtime/client_secrets",
             headers: [
               {"authorization", "Bearer #{api_key}"},
               {"content-type", "application/json"}
             ],
             json: request_body(params)
           ),
         {:ok, session} <- normalize_response(response) do
      {:ok, session}
    else
      false ->
        {:error, :missing_api_key, "OPENAI_API_KEY is not configured."}

      {:error, %Req.TransportError{} = error} ->
        {:error, :transport_error, Exception.message(error)}

      {:error, reason, message} ->
        {:error, reason, message}
    end
  end

  defp request_body(_params) do
    transcription_model = get_config(:transcription_model)
    turn_detection = get_config(:turn_detection)

    %{
      session: %{
        type: "transcription",
        audio: %{
          input: %{
            transcription: %{
              model: transcription_model
            },
            turn_detection: %{
              type: turn_detection
            }
          }
        }
      }
    }
  end

  defp normalize_response(%Req.Response{status: status, body: body}) when status in [200, 201] do
    ephemeral_key = body["value"] || get_in(body, ["client_secret", "value"])

    if is_binary(ephemeral_key) and ephemeral_key != "" do
      {:ok,
       %{
         ephemeral_key: ephemeral_key,
         expires_at: body["expires_at"] || get_in(body, ["client_secret", "expires_at"]),
         model: get_config(:transcription_model),
         turn_detection: get_config(:turn_detection)
       }}
    else
      {:error, :invalid_response, "OpenAI response did not include a client secret."}
    end
  end

  defp normalize_response(%Req.Response{status: status, body: body}) do
    message =
      cond do
        is_map(body) and is_binary(get_in(body, ["error", "message"])) ->
          get_in(body, ["error", "message"])

        is_map(body) and is_binary(body["message"]) ->
          body["message"]

        true ->
          "OpenAI realtime session request failed with status #{status}."
      end

    {:error, :upstream_error, message}
  end

  defp get_config(key) do
    :hgs_video_stories
    |> Application.get_env(:openai_realtime, [])
    |> Keyword.get(key)
  end
end
